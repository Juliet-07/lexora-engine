import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsMongoId,
  IsIn,
  IsArray,
} from 'class-validator';
import { OrgStructureNodeType } from '../schemas';

export class CreateOrgStructureNodeDto {
  @ApiProperty({ enum: OrgStructureNodeType })
  @IsEnum(OrgStructureNodeType)
  type: OrgStructureNodeType;

  @ApiProperty() @IsString() name: string;

  @ApiPropertyOptional() @IsOptional() @IsString() subtitle?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Parent node ids — omit or pass an empty array for a root-level ' +
      'node. More than one id connects this node under multiple ' +
      'parents at once ("one thing can be connected to 2 things").',
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  parentIds?: string[];
}

export class UpdateOrgStructureNodeDto {
  @ApiPropertyOptional({ enum: OrgStructureNodeType })
  @IsOptional()
  @IsEnum(OrgStructureNodeType)
  type?: OrgStructureNodeType;

  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() subtitle?: string | null;

  // An explicit empty array is allowed here (and preserved, not
  // stripped) to move a node back to being a root-level node, or to
  // drop it down to a single parent.
  @ApiPropertyOptional({
    type: [String],
    description:
      'New full set of parent node ids — pass [] to make this a ' +
      'root-level node, or several ids to connect it under more than ' +
      'one parent at once.',
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  parentIds?: string[];
}

export class MoveOrgStructureNodeDto {
  @ApiProperty({ enum: ['up', 'down'] })
  @IsIn(['up', 'down'])
  direction: 'up' | 'down';

  // A node that sits under more than one parent is rendered once per
  // parent, each occurrence with its own left/right position among
  // that parent's other children — so moving it has to say which of
  // those sibling groups to reorder within. Omit (or pass null) for
  // the top-level (root) group.
  @ApiPropertyOptional({
    description:
      "Which parent group to reorder the node's siblings within — " +
      'only needed when the node sits under more than one parent. ' +
      'Defaults to its first parent (or the root group if it has none).',
    nullable: true,
  })
  @IsOptional()
  @IsMongoId()
  contextParentId?: string | null;
}
