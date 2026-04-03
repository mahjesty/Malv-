import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class VerifyEmailDto {
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsString()
  @MinLength(10)
  otp!: string;
}

