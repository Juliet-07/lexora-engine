// Fund document vault — categories and the built-in template library.
// A published Finance template (area "fund") from the Super Admin library
// can be used instead of, or beside, these; both are filled from the same
// merge fields (common/utils/contract-merge-fund-fields.ts).

export const FUND_DOCUMENT_GROUPS: { group: string; categories: string[] }[] = [
  {
    group: 'Legal & Formation',
    categories: [
      'Limited Partnership Agreement (LPA)',
      'LPA Amendment',
      'Private Placement Memorandum (PPM)',
      'GP Management Agreement',
      'Subscription Agreement',
      'Side Letter',
      'Investment Management Agreement',
      'Administration Agreement',
      'Custodian Agreement',
      'Prime Broker Agreement',
      'Advisory Agreement',
    ],
  },
  {
    group: 'Regulatory',
    categories: [
      'Securities Regulator Fund Registration',
      'Financial Centre Registration',
      'Company Registration Certificate',
      'Tax Registration Certificate',
      'AML/KYC — LP Documentation',
      'AML/KYC — Portfolio Company',
      'Regulatory Filing',
      'Compliance Certificate',
    ],
  },
  {
    group: 'Notices & Communications',
    categories: [
      'Capital Call Notice',
      'Distribution Notice',
      'Correspondence',
    ],
  },
  {
    group: 'Financial & Reporting',
    categories: [
      'Quarterly LP Report',
      'Annual Report',
      'Capital Account Statement',
      'Audited Financial Statements',
      'Management Accounts',
      'NAV Statement',
      'Fee Calculation Worksheet',
      'Waterfall Calculation',
      'Bank Statement',
      'Tax Return / Filing',
      'Transfer Pricing Documentation',
    ],
  },
  {
    group: 'Investor Relations',
    categories: [
      'Investor Update / Newsletter',
      'LP Onboarding Pack',
      'Annual Meeting Materials',
    ],
  },
  {
    group: 'Governance',
    categories: [
      'LPAC Meeting Minutes',
      'LP Advisory Committee Minutes',
      'Board Resolution',
      'GP Partner Meeting Minutes',
      'Conflict of Interest Disclosure',
      'Power of Attorney',
      'Certificate of Incumbency',
      'Insurance Policy',
      'Legal Opinion',
    ],
  },
  {
    group: 'Investments & Deals',
    categories: [
      'Investment Memo',
      'IC Paper / Approval',
      'Term Sheet',
      'Share Purchase Agreement (SPA)',
      'Shareholders Agreement (SHA)',
      'Convertible Note Agreement',
      'SAFE Agreement',
      'Co-Investment Term Sheet',
      'Due Diligence Report',
      'Valuation Report',
      'Exit Memo',
    ],
  },
  { group: 'Other', categories: ['Other'] },
];

export const groupForCategory = (category: string): string =>
  FUND_DOCUMENT_GROUPS.find((g) => g.categories.includes(category))?.group ??
  'Other';

export interface BuiltInFundTemplate {
  key: string;
  title: string;
  description: string;
  tag: string;
  category: string;
  /** What the document is drafted for: nothing extra, one LP, a call, a distribution. */
  needs: 'none' | 'lp' | 'call' | 'distribution';
  content: string;
}

const sign = `<p>Yours faithfully,</p><p>&nbsp;</p><p><strong>{{noticeSignatory}}</strong><br/>{{noticeSignatoryTitle}}<br/>for and on behalf of {{gpEntityName}}, general partner of {{fundName}}</p>`;

export const BUILT_IN_FUND_TEMPLATES: BuiltInFundTemplate[] = [
  {
    key: 'side-letter',
    title: 'Side Letter Agreement',
    description:
      'Standard LP side letter with fee, reporting, and co-investment provisions',
    tag: 'Legal',
    category: 'Side Letter',
    needs: 'lp',
    content: `<h1>Side Letter</h1>
<p><strong>{{fundName}}</strong> · Reference {{sideLetterReference}}</p>
<p>Date: {{sideLetterEffectiveDate}}</p>
<p>To: <strong>{{lpName}}</strong> (the "Investor")</p>
<p>Dear Sirs,</p>
<p>We refer to the limited partnership agreement of {{fundName}} dated {{lpaDate}} (the "LPA") and to the Investor's commitment of {{lpCommitment}} to the Fund. Capitalised terms not defined in this letter have the meaning given in the LPA.</p>
<h2>1. Status of this letter</h2>
<p>{{gpEntityName}} (the "General Partner"), acting on behalf of the Fund, agrees that the terms below apply to the Investor in addition to, and where they conflict in place of, the corresponding terms of the LPA. This letter does not amend the LPA as it applies to any other limited partner.</p>
<h2>2. Agreed terms</h2>
<div>{{sideLetterProvisions}}</div>
<h2>3. Most-favoured-nation</h2>
<p>Where a provision above is marked as triggering MFN rights, the General Partner will, within the period set out in the LPA, notify every limited partner whose commitment equals or exceeds the Investor's of the provision and allow them to elect to receive the same term.</p>
<h2>4. General</h2>
<p>This letter is governed by the law that governs the LPA and is subject to the same dispute-resolution provisions. It may be executed in counterparts.</p>
${sign}
<p>&nbsp;</p>
<p>Acknowledged and agreed for and on behalf of <strong>{{lpName}}</strong>:</p>
<p>Name: ______________________ &nbsp; Title: ______________________ &nbsp; Date: ______________</p>`,
  },
  {
    key: 'capital-call-notice',
    title: 'Capital Call Notice',
    description:
      'Formal notice to LP with pro-rata amount, wire details, and due date',
    tag: 'Notices',
    category: 'Capital Call Notice',
    needs: 'call',
    content: `<h1>Capital Call Notice</h1>
<p><strong>{{fundName}}</strong> · Call {{callReference}}</p>
<p>Date of notice: {{callNoticeDate}}</p>
<p>To: <strong>{{lpName}}</strong></p>
<p>Dear Investor,</p>
<p>Pursuant to clause {{callLpaClause}} of the limited partnership agreement dated {{lpaDate}}, the General Partner hereby calls capital from you as follows.</p>
<h2>Amount due</h2>
<p>Purpose: {{callPurpose}}</p>
<p>Your commitment: {{lpCommitment}}<br/>Previously called: {{lpCalledToDate}}<br/><strong>Amount due now: {{callLpAmount}}</strong><br/>Remaining uncalled after this call: {{lpUncalled}}</p>
<p>Payment must be received in cleared funds on or before <strong>{{callDueDate}}</strong>.</p>
<h2>Payment instructions</h2>
<p>Beneficiary: {{wireBeneficiary}}<br/>Bank: {{wireBankName}}<br/>Account: {{wireAccountNumber}}<br/>SWIFT / BIC: {{wireSwift}}<br/>Reference: {{callReference}} — {{lpName}}</p>
<h2>Late payment</h2>
<p>Under clause {{callDefaultInterestClause}} of the LPA, interest accrues on overdue amounts, and under clause {{callDefaultClause}} the General Partner may exercise its remedies for default.</p>
${sign}`,
  },
  {
    key: 'distribution-notice',
    title: 'Distribution Notice',
    description:
      'Distribution notice with waterfall breakdown and payment instructions',
    tag: 'Notices',
    category: 'Distribution Notice',
    needs: 'distribution',
    content: `<h1>Distribution Notice</h1>
<p><strong>{{fundName}}</strong> · Distribution {{distributionReference}}</p>
<p>To: <strong>{{lpName}}</strong></p>
<p>Dear Investor,</p>
<p>The General Partner has resolved to make a distribution of {{distributionTotal}} on {{distributionDate}}, applied through the distribution waterfall in the LPA.</p>
<p><strong>Your share: {{distributionLpAmount}}</strong></p>
<p>Payment will be made to the account we hold for you. Please tell us before {{distributionDate}} if your payment details have changed.</p>
${sign}`,
  },
  {
    key: 'subscription-agreement',
    title: 'Subscription Agreement',
    description:
      'LP subscription agreement with representations, commitments, and AML/KYC',
    tag: 'Legal',
    category: 'Subscription Agreement',
    needs: 'lp',
    content: `<h1>Subscription Agreement</h1>
<p><strong>{{fundName}}</strong></p>
<p>Between <strong>{{gpEntityName}}</strong> (the "General Partner") and <strong>{{lpName}}</strong> (the "Subscriber").</p>
<h2>1. Subscription</h2>
<p>The Subscriber irrevocably subscribes for an interest in {{fundName}} with a capital commitment of <strong>{{lpCommitment}}</strong> in the {{lpClose}} close, and agrees to be bound by the limited partnership agreement dated {{lpaDate}}.</p>
<h2>2. Funding</h2>
<p>The Subscriber will contribute capital within the period stated in each capital call notice the General Partner issues, up to the amount of its commitment.</p>
<h2>3. Representations</h2>
<p>The Subscriber represents that it (a) is duly organised and has authority to enter into this agreement, (b) is investing for its own account, (c) has received and read the offering documents, and (d) is able to bear the economic risk of the investment.</p>
<h2>4. Anti-money-laundering</h2>
<p>The Subscriber will provide the identification and source-of-funds documents the General Partner or the administrator reasonably requests, and accepts that the General Partner may refuse or suspend any payment where it is required to by law.</p>
<h2>5. Signatures</h2>
<p>For the Subscriber: ______________________ &nbsp; Date: ____________</p>
<p>Accepted for the General Partner: {{noticeSignatory}}, {{noticeSignatoryTitle}} &nbsp; Date: ____________</p>`,
  },
  {
    key: 'investor-update',
    title: 'Investor Update / Newsletter',
    description:
      'Quarterly investor update with fund performance, market outlook, and highlights',
    tag: 'Reports',
    category: 'Investor Update / Newsletter',
    needs: 'none',
    content: `<h1>{{fundName}} — Investor Update</h1>
<p>{{todayDate}}</p>
<p>Dear Investors,</p>
<h2>Fund highlights</h2>
<p>Write the headline developments of the quarter here.</p>
<h2>Portfolio</h2>
<p>Summarise new investments, follow-ons and exits.</p>
<h2>Performance</h2>
<p>Add the quarter's NAV, DPI, RVPI and TVPI from the Fund reports.</p>
<h2>Market outlook</h2>
<p>Share your view on the market.</p>
<h2>Upcoming</h2>
<p>List any expected capital calls, distributions and the next LPAC / annual meeting date.</p>
${sign}`,
  },
  {
    key: 'lpac-notice',
    title: 'LP Advisory Committee Notice',
    description: 'LPAC meeting notice, agenda, and minutes template',
    tag: 'Governance',
    category: 'LPAC Meeting Minutes',
    needs: 'none',
    content: `<h1>LP Advisory Committee — Notice of Meeting</h1>
<p><strong>{{fundName}}</strong></p>
<p>Date of notice: {{todayDate}}</p>
<p>Notice is given that a meeting of the LP Advisory Committee will be held on ______________ at ______________.</p>
<h2>Agenda</h2>
<ol><li>Approval of the previous minutes</li><li>Fund performance and portfolio update</li><li>Conflicts of interest and related-party matters</li><li>Valuation policy</li><li>Any other business</li></ol>
<h2>Minutes</h2>
<p>Attendees: &nbsp;<br/>Decisions: &nbsp;<br/>Actions: &nbsp;</p>
${sign}`,
  },
  {
    key: 'transfer-agreement',
    title: 'Transfer / Assignment Agreement',
    description: 'LP interest transfer agreement with GP consent provisions',
    tag: 'Legal',
    category: 'Other',
    needs: 'lp',
    content: `<h1>Transfer of Limited Partner Interest</h1>
<p><strong>{{fundName}}</strong></p>
<p>Transferor: <strong>{{lpName}}</strong> (commitment {{lpCommitment}}, called to date {{lpCalledToDate}})</p>
<p>Transferee: ______________________</p>
<h2>1. Transfer</h2>
<p>The Transferor transfers to the Transferee all of its interest in the Fund, including its unfunded commitment of {{lpUncalled}}, with effect from the date the General Partner consents in writing.</p>
<h2>2. Consent</h2>
<p>The transfer is conditional on the consent of {{gpEntityName}} under the LPA dated {{lpaDate}} and on the Transferee completing the Fund's anti-money-laundering checks.</p>
<h2>3. Assumption</h2>
<p>The Transferee assumes all obligations of the Transferor under the LPA from the effective date, including the obligation to fund future capital calls.</p>
<p>Signed by the Transferor: ______________ &nbsp; the Transferee: ______________ &nbsp; Consent of the General Partner: {{noticeSignatory}}</p>`,
  },
  {
    key: 'default-notice',
    title: 'Default Notice',
    description: 'LP default notice with cure period details and consequences',
    tag: 'Notices',
    category: 'Correspondence',
    needs: 'call',
    content: `<h1>Notice of Default</h1>
<p><strong>{{fundName}}</strong> · Call {{callReference}}</p>
<p>To: <strong>{{lpName}}</strong></p>
<p>Dear Investor,</p>
<p>We refer to the capital call notice dated {{callNoticeDate}} requiring you to pay {{callLpAmount}} by {{callDueDate}}. That amount has not been received in full.</p>
<h2>Cure</h2>
<p>You may cure this default by paying the outstanding amount, plus interest under clause {{callDefaultInterestClause}} of the LPA, within the cure period stated in the LPA.</p>
<h2>Consequences</h2>
<p>If the default is not cured, the General Partner may exercise the remedies in clause {{callDefaultClause}} of the LPA, which can include suspending your rights, reducing your interest and forfeiting amounts already paid.</p>
${sign}`,
  },
];
