import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { TaskPriority, TaskStatus } from '../../common/enums';

export class CriterionDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MinLength(1)
  title: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBoolean()
  done?: boolean;
}

export class CreateTaskDto {
  @IsString()
  @MinLength(2)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  projectName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  assigneeId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  reviewerEmployeeId?: number;

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  collaboratorIds?: number[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedHours?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CriterionDto)
  criteria?: CriterionDto[];
}

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  projectName?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  assigneeId?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  reviewerEmployeeId?: number | null;

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  collaboratorIds?: number[] | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number | null;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsString()
  startDate?: string | null;

  @IsOptional()
  @IsString()
  dueDate?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedHours?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  actualHours?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CriterionDto)
  criteria?: CriterionDto[];
}

export class ListTasksQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  assigneeId?: number;

  /** overdue | today | week | soon | all */
  @IsOptional()
  @IsString()
  sla?: string;

  /** mine | urgent | all */
  @IsOptional()
  @IsString()
  scope?: string;

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class CreateCommentDto {
  @IsString()
  @MinLength(1)
  body: string;
}
