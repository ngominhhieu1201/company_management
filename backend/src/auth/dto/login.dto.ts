import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  /** Username hoặc email công vụ */
  @IsString()
  @MinLength(1)
  username: string;

  @IsString()
  @MinLength(1)
  password: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
