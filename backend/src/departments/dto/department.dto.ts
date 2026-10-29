import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { DepartmentStatus } from '../../common/enums';

export class CreateDepartmentDto {
  @IsString()
  @MinLength(2)
  departmentCode: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  managerEmployeeId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  deputyEmployeeId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  parentDepartmentId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  headcountTarget?: number;

  @IsOptional()
  @IsString()
  foundedAt?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsEnum(DepartmentStatus)
  status?: DepartmentStatus;
}

export class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  managerEmployeeId?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  deputyEmployeeId?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  parentDepartmentId?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  headcountTarget?: number | null;

  @IsOptional()
  @IsString()
  foundedAt?: string | null;

  @IsOptional()
  @IsString()
  location?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEmail()
  contactEmail?: string | null;

  @IsOptional()
  @IsString()
  category?: string | null;

  @IsOptional()
  @IsBoolean()
  recruitmentPaused?: boolean;

  @IsOptional()
  @IsEnum(DepartmentStatus)
  status?: DepartmentStatus;

  /** Lý do cập nhật — ghi vào audit trail */
  @IsOptional()
  @IsString()
  @MinLength(5)
  updateReason?: string;
}

export class ListDepartmentsQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsEnum(DepartmentStatus)
  status?: DepartmentStatus;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  sort?: string;
}

export class CheckCodeQueryDto {
  @IsString()
  @MinLength(2)
  code: string;
}
