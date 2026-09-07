import { IsEmail, IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ type: String, example: 'Linh Demo', minLength: 1, maxLength: 100 })
  @IsString() @Length(1, 100) displayName!: string;
  @ApiProperty({ type: String, example: 'linh.demo@example.com', format: 'email' })
  @IsEmail() email!: string;
  @ApiProperty({ type: String, example: 'StrongPassword123!', format: 'password' })
  @IsString() password!: string;
}

export class VerifyTokenDto {
  @ApiProperty({ type: String, example: 'token-from-verification-email' })
  @IsString() @Length(20, 200) token!: string;
}
export class EmailDto {
  @ApiProperty({ type: String, example: 'linh.demo@example.com', format: 'email' })
  @IsEmail() email!: string;
}
export class LoginDto {
  @ApiProperty({ type: String, example: 'linh.demo@example.com', format: 'email' })
  @IsEmail() email!: string;
  @ApiProperty({ type: String, example: 'StrongPassword123!', format: 'password' })
  @IsString() password!: string;
}
export class RefreshDto {
  @ApiPropertyOptional({ type: String, example: 'refresh-token-for-mobile-client' })
  @IsOptional() @IsString() refreshToken?: string;
}
export class LogoutDto {
  @ApiPropertyOptional({ type: String, example: 'refresh-token-for-mobile-client' })
  @IsOptional() @IsString() refreshToken?: string;
}
export class ResetPasswordDto extends VerifyTokenDto {
  @ApiProperty({ type: String, example: 'NewStrongPassword123!', format: 'password' })
  @IsString() password!: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ type: String, example: 'Linh Nguyen', minLength: 1, maxLength: 100 })
  @IsOptional() @IsString() @Length(1, 100) displayName?: string;
  @ApiPropertyOptional({ type: String, example: 'VND', pattern: '^[A-Z]{3}$' })
  @IsOptional() @Matches(/^[A-Z]{3}$/) defaultCurrency?: string;
  @ApiPropertyOptional({ type: String, example: 'vi', enum: ['en', 'vi', 'fr', 'de', 'es', 'pt', 'ja'] })
  @IsOptional() @IsIn(['en', 'vi', 'fr', 'de', 'es', 'pt', 'ja']) locale?: string;
  @ApiPropertyOptional({ type: String, example: 'Asia/Ho_Chi_Minh', minLength: 1, maxLength: 100 })
  @IsOptional() @IsString() @Length(1, 100) timezone?: string;
  @ApiPropertyOptional({ type: String, example: 'avatars/user-id/avatar.png', minLength: 1, maxLength: 500 })
  @IsOptional() @IsString() @Length(1, 500) avatarKey?: string;
  @ApiPropertyOptional({ type: String, example: 'Expense planning enthusiast', maxLength: 500 })
  @IsOptional() @IsString() @Length(0, 500) bio?: string;
}
