import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';

// Infrastructure modules
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './modules/redis/redis.module';
import { ProvidersModule } from './providers/providers.module';
import { AuditModule } from './modules/audit/audit.module';

// Business modules (24 required modules)
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { VerificationModule, AgeVerificationModule } from './modules/verification/verification.module';
import { CreatorApplicationsModule } from './modules/creator-applications/creator-applications.module';
import { CreatorsModule, CreatorProfilesModule } from './modules/creators/creators.module';
import { RoomsModule, StreamingModule } from './modules/rooms/rooms.module';
import { ChatModule } from './modules/chat/chat.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { TokenPackagesModule } from './modules/token-packages/token-packages.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { TipsModule } from './modules/tips/tips.module';
import { ShowsModule } from './modules/shows/shows.module';
import { FavoritesModule } from './modules/favorites/favorites.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { EarningsModule } from './modules/earnings/earnings.module';
import { PayoutsModule } from './modules/payouts/payouts.module';
import { MediaModule } from './modules/media/media.module';
import { ReportsModule, ModerationModule } from './modules/reports/reports.module';
import { AdminModule } from './modules/admin/admin.module';
import { HealthModule } from './modules/health/health.module';
import { ItemsModule } from './modules/items/items.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    PrismaModule,
    RedisModule,
    ProvidersModule,
    AuditModule,
    AuthModule,
    UsersModule,
    SessionsModule,
    VerificationModule,
    CreatorApplicationsModule,
    CreatorsModule,
    RoomsModule,
    ChatModule,
    WalletModule,
    TokenPackagesModule,
    PaymentsModule,
    TipsModule,
    ShowsModule,
    FavoritesModule,
    NotificationsModule,
    EarningsModule,
    PayoutsModule,
    MediaModule,
    ReportsModule,
    AdminModule,
    HealthModule,
    ItemsModule,
  ],
})
export class AppModule {}
