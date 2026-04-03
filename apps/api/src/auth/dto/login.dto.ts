import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from "class-validator";

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  @IsNotEmpty()
  password!: string;

  @IsOptional()
  @IsString()
  otpCode?: string;
}

