import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  ContractType,
  EmployeeGender,
  EmployeeStatus,
} from '../../common/enums';

export class CreateEmployeeDto {
  @IsString()
  @MinLength(2)
  employeeCode: string;

  @IsString()
  @MinLength(2)
  fullName: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  hireDate?: string;

  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @IsOptional()
  @IsEnum(EmployeeGender)
  gender?: EmployeeGender;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9A-Za-z]{8,20}$/, {
    message: 'nationalId must be 8-20 alphanumeric chars',
  })
  nationalId?: string;

  @IsOptional()
  @IsString()
  permanentAddress?: string;

  @IsOptional()
  @IsString()
  temporaryAddress?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  managerEmployeeId?: number;

  @IsOptional()
  @IsEnum(ContractType)
  contractType?: ContractType;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;
}

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  departmentId?: number | null;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  hireDate?: string | null;

  @IsOptional()
  @IsString()
  dateOfBirth?: string | null;

  @IsOptional()
  @IsEnum(EmployeeGender)
  gender?: EmployeeGender | null;

  @IsOptional()
  @IsString()
  nationalId?: string | null;

  @IsOptional()
  @IsString()
  permanentAddress?: string | null;

  @IsOptional()
  @IsString()
  temporaryAddress?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  managerEmployeeId?: number | null;

  @IsOptional()
  @IsEnum(ContractType)
  contractType?: ContractType | null;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;
}

export class ListEmployeesQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pageSize?: number;
}
