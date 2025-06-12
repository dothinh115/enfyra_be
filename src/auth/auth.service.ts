import { BadRequestException, Injectable } from '@nestjs/common';
import { BcryptService } from './bcrypt.service';
import { ConfigService } from '@nestjs/config';
import { LoginAuthDto } from './dto/login-auth.dto';
import { Session_definition } from '../entities/session_definition.entity';
import { Repository } from 'typeorm';
import { User_definition } from '../entities/user_definition.entity';
import { JwtService } from '@nestjs/jwt';
import { LogoutAuthDto } from './dto/logout-auth.dto';
import { RefreshTokenAuthDto } from './dto/refresh-token-auth.dto';
import { Request } from 'express';
import { DataSourceService } from '../data-source/data-source.service';

@Injectable()
export class AuthService {
  constructor(
    private bcryptService: BcryptService,
    private configService: ConfigService,

    private jwtService: JwtService,
    private dataSourceService: DataSourceService,
  ) {}

  async login(body: LoginAuthDto) {
    const { email, password } = body;
    const userDefRepo: Repository<User_definition> =
      this.dataSourceService.getRepository('user_definition');
    const exists = await userDefRepo.findOne({
      where: {
        email,
      },
    });
    if (
      !exists ||
      !(await this.bcryptService.compare(password, exists.password))
    )
      throw new BadRequestException(`Login failed!`);
    const sessionDefRepo: Repository<Session_definition> =
      this.dataSourceService.getRepository('session_definition');
    const session = await sessionDefRepo.save({
      ...(body.remember && {
        remember: body.remember,
      }),
      user: exists,
    });

    const accessToken = this.jwtService.sign(
      {
        id: exists.id,
      },
      {
        expiresIn: this.configService.get<string>('ACCESS_TOKEN_EXP'),
      },
    );
    const refreshToken = this.jwtService.sign(
      {
        sessionId: session.id,
      },
      {
        expiresIn: body.remember
          ? this.configService.get<string>('REFRESH_TOKEN_REMEMBER_EXP')
          : this.configService.get<string>('REFRESH_TOKEN_NO_REMEMBER_EXP'),
      },
    );
    const decoded: any = this.jwtService.decode(accessToken);
    return {
      accessToken,
      refreshToken,
      expTime: decoded.exp * 1000,
    };
  }

  async logout(body: LogoutAuthDto, req: Request & { user: User_definition }) {
    const { sessionId } = body;
    const sessionDefRepo: Repository<Session_definition> =
      this.dataSourceService.getRepository('session_definition');
    const session = await sessionDefRepo.findOne({
      where: {
        id: sessionId,
      },
      relations: ['user'],
    });
    if (!session || session.user.id !== req.user.id)
      throw new BadRequestException(`Logout failed!`);
    await sessionDefRepo.delete({ id: session.id });
    return 'Logout successfully!';
  }

  async refreshToken(body: RefreshTokenAuthDto) {
    let decoded: any;
    try {
      decoded = this.jwtService.verify(body.refreshToken);
    } catch (e) {
      throw new BadRequestException('Invalid or expired refresh token!');
    }
    const sessionDefRepo: Repository<Session_definition> =
      this.dataSourceService.getRepository('session_definition');
    const session = await sessionDefRepo.findOne({
      where: {
        id: decoded.sessionId,
      },
      relations: ['user'],
    });
    if (!session) {
      throw new BadRequestException('Session not found!');
    }

    const accessToken = this.jwtService.sign(
      {
        id: session.user.id,
      },
      {
        expiresIn: this.configService.get<string>('ACCESS_TOKEN_EXP'),
      },
    );
    const refreshToken = session.remember
      ? this.jwtService.sign(
          { sessionId: session.id },
          {
            expiresIn: this.configService.get<string>(
              'REFRESH_TOKEN_REMEMBER_EXP',
            ),
          },
        )
      : body.refreshToken;
    const accessTokenDecoded = await this.jwtService.decode(accessToken);
    return {
      accessToken,
      refreshToken,
      expTime: accessTokenDecoded.exp * 1000,
    };
  }
}
