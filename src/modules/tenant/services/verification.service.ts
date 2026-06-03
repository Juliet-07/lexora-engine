// import { Injectable, Logger } from '@nestjs/common';
// import { InjectModel } from '@nestjs/mongoose';
// import { Model, Types } from 'mongoose';
// import axios from 'axios';
// import {
//   ClientProfileRecord,
//   ClientProfileDocument,
// } from '../schemas/client-profile.schema';
// import { User, UserDocument } from '../../auth/schemas/user.schema';

// // ─────────────────────────────────────────────────────────────
// // TYPES
// // ─────────────────────────────────────────────────────────────

// export type CheckStatus =
//   | 'pending'
//   | 'passed'
//   | 'flagged'
//   | 'failed'
//   | 'skipped';

// export interface CheckResult {
//   status: CheckStatus;
//   result: string;
//   detail: string;
//   ranAt: Date;
//   matches?: OpenSanctionsMatch[];
//   score?: number;
// }

// export interface VerificationResults {
//   identity: CheckResult;
//   pep: CheckResult;
//   sanctions: CheckResult;
//   ubo: CheckResult;
//   adverseMedia: CheckResult;
//   riskScore: CheckResult & { score: number };
// }

// interface OpenSanctionsMatch {
//   id: string;
//   caption: string;
//   schema: string;
//   score: number;
//   datasets: string[];
//   properties: Record<string, string[]>;
// }

// // ─────────────────────────────────────────────────────────────
// // OPENSANCTIONS API
// // https://www.opensanctions.org/docs/api/
// // Endpoint: POST https://api.opensanctions.org/match/default
// // ─────────────────────────────────────────────────────────────

// const OPENSANCTIONS_BASE = 'https://api.opensanctions.org';
// const MATCH_THRESHOLD = 0.7; // scores above this are flagged

// @Injectable()
// export class VerificationService {
//   private readonly logger = new Logger(VerificationService.name);
//   private readonly apiKey = process.env.OPENSANCTIONS_API_KEY;

//   constructor(
//     @InjectModel(ClientProfileRecord.name)
//     private readonly profileModel: Model<ClientProfileDocument>,
//     @InjectModel(User.name)
//     private readonly userModel: Model<UserDocument>,
//   ) {}

//   // ─────────────────────────────────────────────────────────
//   // MAIN: Run all verifications for a client
//   // Called by: POST /tenant/:id/verify
//   // ─────────────────────────────────────────────────────────

//   async runAllVerifications(
//     clientId: string,
//     tenantId: string,
//     completedBy: string,
//   ): Promise<VerificationResults> {
//     // Load client data
//     const [client, profile, onboarding] = await Promise.all([
//       this.userModel
//         .findOne({ _id: clientId, tenantId: new Types.ObjectId(tenantId) })
//         .lean(),
//       this.profileModel
//         .findOne({ userId: new Types.ObjectId(clientId) })
//         .lean(),
//       // Pull formData from onboarding_submissions
//       this.profileModel.db
//         .collection('onboarding_submissions')
//         .findOne({ clientId: new Types.ObjectId(clientId) }),
//     ]);

//     if (!client || !profile) {
//       throw new Error('Client or profile not found');
//     }

//     const formData: Record<string, any> = (onboarding as any)?.formData ?? {};
//     const isIndividual = profile.classifications === 'individual';

//     // Build the name and birthdate from form data
//     const fullName = `${client.firstName} ${client.lastName}`.trim();
//     const birthDate = formData.dob || null;
//     const country = formData.country || formData.regCountry || null;

//     this.logger.log(
//       `Running verifications for client: ${fullName} (${clientId})`,
//     );

//     // Run all checks in parallel — faster than sequential
//     const [pepResult, sanctionsResult, uboResult, adverseMediaResult] =
//       await Promise.all([
//         this.runPepCheck(fullName, birthDate, country, isIndividual),
//         this.runSanctionsCheck(fullName, birthDate, country, isIndividual),
//         isIndividual
//           ? Promise.resolve(
//               this.skipCheck('Not applicable for individual clients'),
//             )
//           : this.runUboCheck(formData),
//         this.runAdverseMediaCheck(fullName, country, isIndividual),
//       ]);

//     // Identity is a manual review of uploaded documents
//     const identityResult = this.buildIdentityResult(onboarding);

//     // Compute risk score from all results
//     const riskScoreResult = this.computeRiskScore({
//       identity: identityResult,
//       pep: pepResult,
//       sanctions: sanctionsResult,
//       ubo: uboResult,
//       adverseMedia: adverseMediaResult,
//     });

//     const results: VerificationResults = {
//       identity: identityResult,
//       pep: pepResult,
//       sanctions: sanctionsResult,
//       ubo: uboResult,
//       adverseMedia: adverseMediaResult,
//       riskScore: riskScoreResult,
//     };

//     // Determine overall risk level
//     const riskLevel = this.getRiskLevel(riskScoreResult.score);

//     // Save results + mark verification complete
//     await this.profileModel.findOneAndUpdate(
//       { userId: new Types.ObjectId(clientId) },
//       {
//         verificationResults: results,
//         verificationCompletedAt: new Date(),
//         riskLevel,
//         $push: {
//           'metadata.auditTrail': {
//             action: 'verification_completed',
//             performedBy: completedBy,
//             timestamp: new Date(),
//             detail: `Risk level: ${riskLevel} | Score: ${riskScoreResult.score}`,
//           },
//         },
//       },
//     );

//     this.logger.log(
//       `Verification complete for ${fullName}: score=${riskScoreResult.score}, level=${riskLevel}`,
//     );

//     return results;
//   }

//   // ─────────────────────────────────────────────────────────
//   // INDIVIDUAL CHECKS
//   // ─────────────────────────────────────────────────────────

//   /**
//    * Identity (CDD) — Manual check.
//    * We can't do biometric matching, but we confirm documents were uploaded.
//    */
//   private buildIdentityResult(onboarding: any): CheckResult {
//     const documents: any[] = onboarding?.documents ?? [];
//     const hasIdentityDoc = documents.some(
//       (d) => d.category === 'identity' || d.category === 'corporate_doc',
//     );

//     if (!onboarding) {
//       return {
//         status: 'failed',
//         result: 'No onboarding submission found',
//         detail: 'Client has not submitted their onboarding form',
//         ranAt: new Date(),
//       };
//     }

//     if (!hasIdentityDoc) {
//       return {
//         status: 'flagged',
//         result: 'Identity document missing',
//         detail:
//           'No identity or corporate document found in submission. Manual review required.',
//         ranAt: new Date(),
//       };
//     }

//     return {
//       status: 'passed',
//       result: 'Documents submitted',
//       detail: `${documents.length} document(s) uploaded. Manual review of authenticity required.`,
//       ranAt: new Date(),
//     };
//   }

//   /**
//    * PEP Screening — checks if the person is a politically exposed person.
//    * Uses OpenSanctions /match endpoint with the 'peps' dataset scope.
//    */
//   private async runPepCheck(
//     name: string,
//     birthDate: string | null,
//     country: string | null,
//     isIndividual: boolean,
//   ): Promise<CheckResult> {
//     try {
//       const entity = this.buildPersonEntity(name, birthDate, country);
//       const matches = await this.matchOpenSanctions(entity, [
//         'peps',
//         'sanctions',
//       ]);

//       const pepMatches = matches.filter(
//         (m) =>
//           m.score >= MATCH_THRESHOLD &&
//           (m.datasets.some((d) => d.includes('pep')) || m.schema === 'Person'),
//       );

//       if (pepMatches.length > 0) {
//         return {
//           status: 'flagged',
//           result: `${pepMatches.length} potential PEP match(es) found`,
//           detail: `Matches: ${pepMatches.map((m) => m.caption).join(', ')}. Manual review required.`,
//           ranAt: new Date(),
//           matches: pepMatches,
//         };
//       }

//       return {
//         status: 'passed',
//         result: 'No PEP matches found',
//         detail: 'Individual not found in PEP databases',
//         ranAt: new Date(),
//         matches: [],
//       };
//     } catch (err) {
//       this.logger.error(`PEP check failed: ${err.message}`);
//       return {
//         status: 'failed',
//         result: 'Check failed',
//         detail: `Could not connect to PEP database: ${err.message}`,
//         ranAt: new Date(),
//       };
//     }
//   }

//   /**
//    * Sanctions Check — checks OFAC, UN, EU, and 300+ global lists.
//    * Uses OpenSanctions /match endpoint with the 'sanctions' dataset.
//    */
//   private async runSanctionsCheck(
//     name: string,
//     birthDate: string | null,
//     country: string | null,
//     isIndividual: boolean,
//   ): Promise<CheckResult> {
//     try {
//       const entity = isIndividual
//         ? this.buildPersonEntity(name, birthDate, country)
//         : this.buildOrganisationEntity(name, country);

//       const matches = await this.matchOpenSanctions(entity, ['sanctions']);

//       const sanctionMatches = matches.filter((m) => m.score >= MATCH_THRESHOLD);

//       if (sanctionMatches.length > 0) {
//         const programs = sanctionMatches
//           .flatMap((m) => m.datasets)
//           .filter((d) => d !== 'sanctions')
//           .join(', ');

//         return {
//           status: 'flagged',
//           result: `${sanctionMatches.length} sanctions match(es) found`,
//           detail: `Found on: ${programs || 'global sanctions list'}. Immediate review required.`,
//           ranAt: new Date(),
//           matches: sanctionMatches,
//         };
//       }

//       return {
//         status: 'passed',
//         result: 'Clear',
//         detail: 'No matches across OFAC, UN, EU, and global sanctions lists',
//         ranAt: new Date(),
//         matches: [],
//       };
//     } catch (err) {
//       this.logger.error(`Sanctions check failed: ${err.message}`);
//       return {
//         status: 'failed',
//         result: 'Check failed',
//         detail: `Could not connect to sanctions database: ${err.message}`,
//         ranAt: new Date(),
//       };
//     }
//   }

//   /**
//    * UBO Identification — checks beneficial owners (corporate clients only).
//    * Screens each listed beneficial owner against sanctions and PEP lists.
//    */
//   private async runUboCheck(
//     formData: Record<string, any>,
//   ): Promise<CheckResult> {
//     try {
//       const beneficialOwners: any[] = formData.beneficialOwnersList ?? [];
//       const directors: any[] = formData.directorsList ?? [];
//       const allPersons = [...beneficialOwners, ...directors];

//       if (allPersons.length === 0) {
//         return {
//           status: 'flagged',
//           result: 'No UBOs declared',
//           detail:
//             'No beneficial owners or directors found in the onboarding submission.',
//           ranAt: new Date(),
//         };
//       }

//       const flagged: string[] = [];
//       const allMatches: OpenSanctionsMatch[] = [];

//       // Screen each UBO in parallel
//       await Promise.all(
//         allPersons.map(async (person) => {
//           const name =
//             `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim();
//           if (!name) return;

//           const entity = this.buildPersonEntity(
//             name,
//             person.dob ?? null,
//             person.nationality ?? null,
//           );
//           const matches = await this.matchOpenSanctions(entity, [
//             'sanctions',
//             'peps',
//           ]);
//           const hits = matches.filter((m) => m.score >= MATCH_THRESHOLD);

//           if (hits.length > 0) {
//             flagged.push(name);
//             allMatches.push(...hits);
//           }
//         }),
//       );

//       if (flagged.length > 0) {
//         return {
//           status: 'flagged',
//           result: `${flagged.length} UBO/director match(es) found`,
//           detail: `Flagged individuals: ${flagged.join(', ')}. Manual review required.`,
//           ranAt: new Date(),
//           matches: allMatches,
//         };
//       }

//       return {
//         status: 'passed',
//         result: `${allPersons.length} UBO/director(s) screened — clear`,
//         detail:
//           'All listed beneficial owners and directors passed sanctions and PEP screening.',
//         ranAt: new Date(),
//         matches: [],
//       };
//     } catch (err) {
//       this.logger.error(`UBO check failed: ${err.message}`);
//       return {
//         status: 'failed',
//         result: 'Check failed',
//         detail: `UBO screening error: ${err.message}`,
//         ranAt: new Date(),
//       };
//     }
//   }

//   /**
//    * Adverse Media — checks for negative news and reputational risk.
//    * Uses OpenSanctions 'default' dataset which includes crime and
//    * corruption data alongside sanctions.
//    */
//   private async runAdverseMediaCheck(
//     name: string,
//     country: string | null,
//     isIndividual: boolean,
//   ): Promise<CheckResult> {
//     try {
//       const entity = isIndividual
//         ? this.buildPersonEntity(name, null, country)
//         : this.buildOrganisationEntity(name, country);

//       // Use the full 'default' dataset which includes crime/corruption entries
//       const matches = await this.matchOpenSanctions(entity, ['default']);

//       const adverseMatches = matches.filter(
//         (m) =>
//           m.score >= MATCH_THRESHOLD &&
//           (m.datasets.some(
//             (d) =>
//               d.includes('crime') ||
//               d.includes('corruption') ||
//               d.includes('interpol') ||
//               d.includes('wanted'),
//           ) ||
//             m.schema === 'CriminalOrganization'),
//       );

//       if (adverseMatches.length > 0) {
//         return {
//           status: 'flagged',
//           result: `${adverseMatches.length} adverse media match(es)`,
//           detail: `Found in: ${adverseMatches.map((m) => m.datasets.join(', ')).join(' | ')}. Review required.`,
//           ranAt: new Date(),
//           matches: adverseMatches,
//         };
//       }

//       return {
//         status: 'passed',
//         result: 'Clear',
//         detail: 'No adverse media or criminal database matches found',
//         ranAt: new Date(),
//         matches: [],
//       };
//     } catch (err) {
//       this.logger.error(`Adverse media check failed: ${err.message}`);
//       return {
//         status: 'failed',
//         result: 'Check failed',
//         detail: `Adverse media screening error: ${err.message}`,
//         ranAt: new Date(),
//       };
//     }
//   }

//   // ─────────────────────────────────────────────────────────
//   // RISK SCORING
//   // ─────────────────────────────────────────────────────────

//   /**
//    * Computes a composite risk score (0–100) from all check results.
//    * Weights:
//    *   - Sanctions:    40 points (highest — immediate regulatory risk)
//    *   - PEP:          25 points
//    *   - UBO:          20 points
//    *   - Adverse Media:10 points
//    *   - Identity:      5 points
//    */
//   private computeRiskScore(
//     checks: Omit<VerificationResults, 'riskScore'>,
//   ): CheckResult & { score: number } {
//     const weights = {
//       sanctions: 40,
//       pep: 25,
//       ubo: 20,
//       adverseMedia: 10,
//       identity: 5,
//     };

//     let score = 0;

//     for (const [key, weight] of Object.entries(weights)) {
//       const check = checks[key as keyof typeof checks];
//       if (check.status === 'flagged') score += weight;
//       if (check.status === 'failed') score += Math.round(weight * 0.5); // partial — unknown
//     }

//     const level = this.getRiskLevel(score);
//     const detail = this.buildScoreDetail(checks);

//     return {
//       status: score >= 40 ? 'flagged' : score > 0 ? 'flagged' : 'passed',
//       result: `${level} (${score}/100)`,
//       detail,
//       score,
//       ranAt: new Date(),
//     };
//   }

//   private getRiskLevel(score: number): string {
//     if (score >= 70) return 'critical';
//     if (score >= 40) return 'high';
//     if (score >= 15) return 'medium';
//     if (score > 0) return 'low';
//     return 'low';
//   }

//   private buildScoreDetail(
//     checks: Omit<VerificationResults, 'riskScore'>,
//   ): string {
//     const flagged = Object.entries(checks)
//       .filter(([, c]) => c.status === 'flagged')
//       .map(([k]) => k);
//     const failed = Object.entries(checks)
//       .filter(([, c]) => c.status === 'failed')
//       .map(([k]) => k);

//     const parts: string[] = [];
//     if (flagged.length > 0) parts.push(`Flagged: ${flagged.join(', ')}`);
//     if (failed.length > 0) parts.push(`Failed: ${failed.join(', ')}`);

//     return parts.length > 0
//       ? parts.join(' | ')
//       : 'All checks passed — low risk';
//   }

//   // ─────────────────────────────────────────────────────────
//   // OPENSANCTIONS API HELPERS
//   // ─────────────────────────────────────────────────────────

//   /**
//    * POST https://api.opensanctions.org/match/{dataset}
//    * Docs: https://www.opensanctions.org/docs/api/matching/
//    *
//    * Sends one entity to match against the specified datasets.
//    * Returns an array of matches with scores.
//    */
//   private async matchOpenSanctions(
//     entity: Record<string, any>,
//     datasets: string[],
//   ): Promise<OpenSanctionsMatch[]> {
//     // Use 'default' dataset which covers everything
//     const dataset = datasets.includes('default') ? 'default' : 'default';

//     const response = await axios.post(
//       `${OPENSANCTIONS_BASE}/match/${dataset}`,
//       { queries: { q: entity } },
//       {
//         headers: {
//           Authorization: `ApiKey ${this.apiKey}`,
//           'Content-Type': 'application/json',
//         },
//         timeout: 15000,
//       },
//     );

//     const results = response.data?.responses?.q?.results ?? [];
//     return results as OpenSanctionsMatch[];
//   }

//   private buildPersonEntity(
//     name: string,
//     birthDate: string | null,
//     country: string | null,
//   ): Record<string, any> {
//     const entity: any = {
//       schema: 'Person',
//       properties: {
//         name: [name],
//       },
//     };
//     if (birthDate) entity.properties.birthDate = [birthDate];
//     if (country) entity.properties.nationality = [country];
//     return entity;
//   }

//   private buildOrganisationEntity(
//     name: string,
//     country: string | null,
//   ): Record<string, any> {
//     const entity: any = {
//       schema: 'Organization',
//       properties: {
//         name: [name],
//       },
//     };
//     if (country) entity.properties.country = [country];
//     return entity;
//   }

//   private skipCheck(detail: string): CheckResult {
//     return {
//       status: 'skipped',
//       result: 'N/A',
//       detail,
//       ranAt: new Date(),
//     };
//   }
// }

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import axios from 'axios';
import {
  ClientProfileRecord,
  ClientProfileDocument,
} from '../schemas/client-profile.schema';
import { User, UserDocument } from '../../auth/schemas/user.schema';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export type CheckStatus =
  | 'pending'
  | 'passed'
  | 'flagged'
  | 'failed'
  | 'skipped';

export interface CheckResult {
  status: CheckStatus;
  result: string;
  detail: string;
  ranAt: Date;
  matches?: OpenSanctionsMatch[];
  score?: number;
}

export interface VerificationResults {
  identity: CheckResult;
  pep: CheckResult;
  sanctions: CheckResult;
  ubo: CheckResult;
  adverseMedia: CheckResult;
  riskScore: CheckResult & { score: number };
}

interface OpenSanctionsMatch {
  id: string;
  caption: string;
  schema: string;
  score: number;
  datasets: string[];
  properties: Record<string, string[]>;
}

const OPENSANCTIONS_BASE = 'https://api.opensanctions.org';
const MATCH_THRESHOLD = 0.7;

// ─────────────────────────────────────────────────────────────
// Dataset routing — maps what we want to check → the correct
// OpenSanctions dataset slug to use in /match/{dataset}
// ─────────────────────────────────────────────────────────────
const DATASET_MAP = {
  pep: 'peps', // PEP-specific dataset
  sanctions: 'sanctions', // Consolidated sanctions (OFAC, EU, UN, UK etc.)
  default: 'default', // Everything — used for adverse media
} as const;

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);
  private readonly apiKey = process.env.OPENSANCTIONS_API_KEY;

  constructor(
    @InjectModel(ClientProfileRecord.name)
    private readonly profileModel: Model<ClientProfileDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  // ─────────────────────────────────────────────────────────
  // MAIN: Run all verifications for a client
  // ─────────────────────────────────────────────────────────

  async runAllVerifications(
    clientId: string,
    tenantId: string,
    completedBy: string,
  ): Promise<VerificationResults> {
    const [client, profile, onboarding] = await Promise.all([
      this.userModel
        .findOne({ _id: clientId, tenantId: new Types.ObjectId(tenantId) })
        .lean(),
      this.profileModel
        .findOne({ userId: new Types.ObjectId(clientId) })
        .lean(),
      this.profileModel.db
        .collection('onboarding_submissions')
        .findOne({ clientId: new Types.ObjectId(clientId) }),
    ]);

    if (!client || !profile) {
      throw new Error('Client or profile not found');
    }

    const formData: Record<string, any> = (onboarding as any)?.formData ?? {};
    const isIndividual = profile.classifications === 'individual';

    const fullName = `${client.firstName} ${client.lastName}`.trim();

    // ── Field name resolution — handles different form implementations ──
    // dob, dateOfBirth, date_of_birth — whichever the onboarding form uses
    const birthDate =
      formData.dob ||
      formData.dateOfBirth ||
      formData.date_of_birth ||
      formData.birthDate ||
      null;

    // country of residence or registration
    const country =
      formData.country ||
      formData.nationality ||
      formData.regCountry ||
      formData.countryOfResidence ||
      formData.registrationCountry ||
      null;

    this.logger.log(
      `Running verifications for: ${fullName} (${clientId}) | individual=${isIndividual}`,
    );

    const [pepResult, sanctionsResult, uboResult, adverseMediaResult] =
      await Promise.all([
        this.runPepCheck(fullName, birthDate, country),
        this.runSanctionsCheck(fullName, birthDate, country, isIndividual),
        isIndividual
          ? Promise.resolve(
              this.skipCheck('Not applicable for individual clients'),
            )
          : this.runUboCheck(formData),
        this.runAdverseMediaCheck(fullName, country, isIndividual),
      ]);

    const identityResult = this.buildIdentityResult(onboarding);

    const riskScoreResult = this.computeRiskScore({
      identity: identityResult,
      pep: pepResult,
      sanctions: sanctionsResult,
      ubo: uboResult,
      adverseMedia: adverseMediaResult,
    });

    const results: VerificationResults = {
      identity: identityResult,
      pep: pepResult,
      sanctions: sanctionsResult,
      ubo: uboResult,
      adverseMedia: adverseMediaResult,
      riskScore: riskScoreResult,
    };

    const riskLevel = this.getRiskLevel(riskScoreResult.score);

    await this.profileModel.findOneAndUpdate(
      { userId: new Types.ObjectId(clientId) },
      {
        verificationResults: results,
        verificationCompletedAt: new Date(),
        riskLevel,
        $push: {
          'metadata.auditTrail': {
            action: 'verification_completed',
            performedBy: completedBy,
            timestamp: new Date(),
            detail: `Risk level: ${riskLevel} | Score: ${riskScoreResult.score}`,
          },
        },
      },
    );

    this.logger.log(
      `Verification complete: ${fullName} | score=${riskScoreResult.score} | level=${riskLevel}`,
    );

    return results;
  }

  // ─────────────────────────────────────────────────────────
  // INDIVIDUAL CHECKS
  // ─────────────────────────────────────────────────────────

  private buildIdentityResult(onboarding: any): CheckResult {
    if (!onboarding) {
      return {
        status: 'failed',
        result: 'No onboarding submission found',
        detail: 'Client has not submitted their onboarding form',
        ranAt: new Date(),
      };
    }

    const documents: any[] = onboarding?.documents ?? [];
    const hasIdentityDoc = documents.some(
      (d) =>
        d.category === 'identity' ||
        d.category === 'corporate_doc' ||
        d.type === 'id' ||
        d.type === 'passport' ||
        d.documentType?.toLowerCase().includes('id') ||
        d.documentType?.toLowerCase().includes('passport'),
    );

    if (!hasIdentityDoc) {
      return {
        status: 'flagged',
        result: 'Identity document missing',
        detail:
          'No identity or corporate document found in submission. Manual review required.',
        ranAt: new Date(),
      };
    }

    return {
      status: 'passed',
      result: 'Documents submitted',
      detail: `${documents.length} document(s) uploaded. Manual review of authenticity required.`,
      ranAt: new Date(),
    };
  }

  /**
   * PEP Screening — uses the dedicated 'peps' dataset.
   *
   * FIX: Previously always used 'default' dataset.
   * FIX: Previously flagged ANY Person schema entity — now only flags
   *      entities found in PEP-specific datasets (pep, politician, everypolitician).
   */
  private async runPepCheck(
    name: string,
    birthDate: string | null,
    country: string | null,
  ): Promise<CheckResult> {
    try {
      const entity = this.buildPersonEntity(name, birthDate, country);

      // ✅ Use 'peps' dataset — correct endpoint for PEP screening
      const matches = await this.matchOpenSanctions(entity, DATASET_MAP.pep);

      // ✅ Fixed: only flag if the match comes from a PEP-specific dataset
      // Removed the broken `m.schema === 'Person'` catch-all that flagged everyone
      const pepMatches = matches.filter(
        (m) =>
          m.score >= MATCH_THRESHOLD &&
          m.datasets.some(
            (d) =>
              d.includes('pep') ||
              d.includes('politician') ||
              d === 'everypolitician' ||
              d.includes('official') ||
              d.includes('government'),
          ),
      );

      if (pepMatches.length > 0) {
        return {
          status: 'flagged',
          result: `${pepMatches.length} potential PEP match(es) found`,
          detail: `Matches: ${pepMatches.map((m) => m.caption).join(', ')}. Manual review required.`,
          ranAt: new Date(),
          matches: pepMatches,
        };
      }

      return {
        status: 'passed',
        result: 'No PEP matches found',
        detail: 'Not found in PEP databases',
        ranAt: new Date(),
        matches: [],
      };
    } catch (err) {
      this.logger.error(`PEP check failed: ${err.message}`);
      return {
        status: 'failed',
        result: 'Check failed',
        detail: `Could not connect to PEP database: ${err.message}`,
        ranAt: new Date(),
      };
    }
  }

  /**
   * Sanctions Check — uses the dedicated 'sanctions' dataset.
   *
   * FIX: Previously always used 'default' dataset regardless of what was passed.
   */
  private async runSanctionsCheck(
    name: string,
    birthDate: string | null,
    country: string | null,
    isIndividual: boolean,
  ): Promise<CheckResult> {
    try {
      const entity = isIndividual
        ? this.buildPersonEntity(name, birthDate, country)
        : this.buildOrganisationEntity(name, country);

      // ✅ Use 'sanctions' dataset — correct endpoint for sanctions screening
      const matches = await this.matchOpenSanctions(
        entity,
        DATASET_MAP.sanctions,
      );

      const sanctionMatches = matches.filter((m) => m.score >= MATCH_THRESHOLD);

      if (sanctionMatches.length > 0) {
        const programs = [
          ...new Set(sanctionMatches.flatMap((m) => m.datasets)),
        ].join(', ');

        return {
          status: 'flagged',
          result: `${sanctionMatches.length} sanctions match(es) found`,
          detail: `Found in: ${programs || 'global sanctions list'}. Immediate review required.`,
          ranAt: new Date(),
          matches: sanctionMatches,
        };
      }

      return {
        status: 'passed',
        result: 'Clear',
        detail: 'No matches across OFAC, UN, EU, and global sanctions lists',
        ranAt: new Date(),
        matches: [],
      };
    } catch (err) {
      this.logger.error(`Sanctions check failed: ${err.message}`);
      return {
        status: 'failed',
        result: 'Check failed',
        detail: `Could not connect to sanctions database: ${err.message}`,
        ranAt: new Date(),
      };
    }
  }

  /**
   * UBO Identification — checks beneficial owners (corporate clients only).
   *
   * FIX: Now handles multiple possible field name formats from the onboarding form.
   * The form may use beneficialOwnersList, beneficialOwners, uboList, directors, directorsList etc.
   */
  private async runUboCheck(
    formData: Record<string, any>,
  ): Promise<CheckResult> {
    try {
      // ✅ Fixed: try all possible field names the onboarding form might use
      const beneficialOwners: any[] =
        formData.beneficialOwnersList ??
        formData.beneficialOwners ??
        formData.uboList ??
        formData.ubos ??
        [];

      const directors: any[] =
        formData.directorsList ??
        formData.directors ??
        formData.boardMembers ??
        [];

      const allPersons = [...beneficialOwners, ...directors];

      if (allPersons.length === 0) {
        return {
          status: 'flagged',
          result: 'No UBOs declared',
          detail:
            'No beneficial owners or directors found in the onboarding submission. Please review manually.',
          ranAt: new Date(),
        };
      }

      const flagged: string[] = [];
      const allMatches: OpenSanctionsMatch[] = [];

      await Promise.all(
        allPersons.map(async (person) => {
          // ✅ Fixed: handle various field name formats for person name
          const firstName =
            person.firstName ?? person.first_name ?? person.givenName ?? '';
          const lastName =
            person.lastName ??
            person.last_name ??
            person.surname ??
            person.familyName ??
            '';
          const name = `${firstName} ${lastName}`.trim();
          if (!name) return;

          const dob =
            person.dob ?? person.dateOfBirth ?? person.date_of_birth ?? null;

          const nationality =
            person.nationality ??
            person.country ??
            person.countryOfResidence ??
            null;

          const entity = this.buildPersonEntity(name, dob, nationality);

          // Screen against both sanctions AND peps for UBOs
          const [sanctionHits, pepHits] = await Promise.all([
            this.matchOpenSanctions(entity, DATASET_MAP.sanctions),
            this.matchOpenSanctions(entity, DATASET_MAP.pep),
          ]);

          const hits = [
            ...sanctionHits.filter((m) => m.score >= MATCH_THRESHOLD),
            ...pepHits.filter(
              (m) =>
                m.score >= MATCH_THRESHOLD &&
                m.datasets.some(
                  (d) =>
                    d.includes('pep') ||
                    d.includes('politician') ||
                    d === 'everypolitician',
                ),
            ),
          ];

          if (hits.length > 0) {
            flagged.push(name);
            allMatches.push(...hits);
          }
        }),
      );

      if (flagged.length > 0) {
        return {
          status: 'flagged',
          result: `${flagged.length} UBO/director match(es) found`,
          detail: `Flagged: ${flagged.join(', ')}. Manual review required.`,
          ranAt: new Date(),
          matches: allMatches,
        };
      }

      return {
        status: 'passed',
        result: `${allPersons.length} UBO/director(s) screened — clear`,
        detail:
          'All listed beneficial owners and directors passed sanctions and PEP screening.',
        ranAt: new Date(),
        matches: [],
      };
    } catch (err) {
      this.logger.error(`UBO check failed: ${err.message}`);
      return {
        status: 'failed',
        result: 'Check failed',
        detail: `UBO screening error: ${err.message}`,
        ranAt: new Date(),
      };
    }
  }

  /**
   * Adverse Media — uses the 'default' dataset which aggregates everything
   * including crime, corruption, interpol, and wanted lists.
   */
  private async runAdverseMediaCheck(
    name: string,
    country: string | null,
    isIndividual: boolean,
  ): Promise<CheckResult> {
    try {
      const entity = isIndividual
        ? this.buildPersonEntity(name, null, country)
        : this.buildOrganisationEntity(name, country);

      // Use 'default' — covers crime/corruption not in sanctions/peps datasets
      const matches = await this.matchOpenSanctions(
        entity,
        DATASET_MAP.default,
      );

      const adverseMatches = matches.filter(
        (m) =>
          m.score >= MATCH_THRESHOLD &&
          (m.datasets.some(
            (d) =>
              d.includes('crime') ||
              d.includes('corruption') ||
              d.includes('interpol') ||
              d.includes('wanted') ||
              d.includes('criminal') ||
              d.includes('fraud'),
          ) ||
            m.schema === 'CriminalOrganization' ||
            m.schema === 'CriminalCase'),
      );

      if (adverseMatches.length > 0) {
        return {
          status: 'flagged',
          result: `${adverseMatches.length} adverse media match(es)`,
          detail: `Found in: ${adverseMatches.map((m) => m.datasets.join(', ')).join(' | ')}. Review required.`,
          ranAt: new Date(),
          matches: adverseMatches,
        };
      }

      return {
        status: 'passed',
        result: 'Clear',
        detail: 'No adverse media or criminal database matches found',
        ranAt: new Date(),
        matches: [],
      };
    } catch (err) {
      this.logger.error(`Adverse media check failed: ${err.message}`);
      return {
        status: 'failed',
        result: 'Check failed',
        detail: `Adverse media screening error: ${err.message}`,
        ranAt: new Date(),
      };
    }
  }

  // ─────────────────────────────────────────────────────────
  // RISK SCORING
  // ─────────────────────────────────────────────────────────

  private computeRiskScore(
    checks: Omit<VerificationResults, 'riskScore'>,
  ): CheckResult & { score: number } {
    const weights = {
      sanctions: 40,
      pep: 25,
      ubo: 20,
      adverseMedia: 10,
      identity: 5,
    };

    let score = 0;
    for (const [key, weight] of Object.entries(weights)) {
      const check = checks[key as keyof typeof checks];
      if (check.status === 'flagged') score += weight;
      if (check.status === 'failed') score += Math.round(weight * 0.5);
    }

    const level = this.getRiskLevel(score);
    const detail = this.buildScoreDetail(checks);

    return {
      status: score > 0 ? 'flagged' : 'passed',
      result: `${level} (${score}/100)`,
      detail,
      score,
      ranAt: new Date(),
    };
  }

  private getRiskLevel(score: number): string {
    if (score >= 70) return 'critical';
    if (score >= 40) return 'high';
    if (score >= 15) return 'medium';
    if (score > 0) return 'low';
    return 'low';
  }

  private buildScoreDetail(
    checks: Omit<VerificationResults, 'riskScore'>,
  ): string {
    const flagged = Object.entries(checks)
      .filter(([, c]) => c.status === 'flagged')
      .map(([k]) => k);
    const failed = Object.entries(checks)
      .filter(([, c]) => c.status === 'failed')
      .map(([k]) => k);

    const parts: string[] = [];
    if (flagged.length > 0) parts.push(`Flagged: ${flagged.join(', ')}`);
    if (failed.length > 0) parts.push(`Failed: ${failed.join(', ')}`);
    return parts.length > 0
      ? parts.join(' | ')
      : 'All checks passed — low risk';
  }

  // ─────────────────────────────────────────────────────────
  // OPENSANCTIONS API HELPERS
  // ─────────────────────────────────────────────────────────

  /**
   * FIX: Previously always used 'default' dataset regardless of input.
   * Now routes to the correct dataset based on what's being checked.
   *
   * API: POST https://api.opensanctions.org/match/{dataset}
   */
  private async matchOpenSanctions(
    entity: Record<string, any>,
    dataset: string, // ✅ now receives the actual dataset to use
  ): Promise<OpenSanctionsMatch[]> {
    const response = await axios.post(
      `${OPENSANCTIONS_BASE}/match/${dataset}`,
      { queries: { q: entity } },
      {
        headers: {
          Authorization: `ApiKey ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      },
    );

    const results = response.data?.responses?.q?.results ?? [];
    return results as OpenSanctionsMatch[];
  }

  private buildPersonEntity(
    name: string,
    birthDate: string | null,
    country: string | null,
  ): Record<string, any> {
    const entity: any = {
      schema: 'Person',
      properties: { name: [name] },
    };
    if (birthDate) entity.properties.birthDate = [birthDate];
    if (country) entity.properties.nationality = [country];
    return entity;
  }

  private buildOrganisationEntity(
    name: string,
    country: string | null,
  ): Record<string, any> {
    const entity: any = {
      schema: 'Organization',
      properties: { name: [name] },
    };
    if (country) entity.properties.country = [country];
    return entity;
  }

  private skipCheck(detail: string): CheckResult {
    return { status: 'skipped', result: 'N/A', detail, ranAt: new Date() };
  }
}
