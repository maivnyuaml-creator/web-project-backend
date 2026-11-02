import { PrismaClient, Role, ApplicationStatus, VerificationStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Velora Live database...');

  // 1. Create categories
  const categories = [
    { name: 'Talk & Chill', slug: 'talk-chill', description: 'Interactive conversation, lounge, and hangout' },
    { name: 'Cosplay & Costume', slug: 'cosplay-costume', description: 'Themed streams and creative outfits' },
    { name: 'Dance & Music', slug: 'dance-music', description: 'Rhythm, dance routines, and musical performances' },
    { name: 'Gaming & Fun', slug: 'gaming-fun', description: 'Live interactive gaming and playful sessions' },
    { name: 'VIP & Exclusive', slug: 'vip-exclusive', description: 'Premium shows and private lounges' },
  ];

  for (const cat of categories) {
    await prisma.roomCategory.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
  }

  // 2. Create Token Packages
  const tokenPackages = [
    { name: 'Starter Pack', tokenAmount: 100, bonusTokens: 0, priceMinorUnits: 999, currency: 'USD' },
    { name: 'Popular Pack', tokenAmount: 500, bonusTokens: 50, priceMinorUnits: 4999, currency: 'USD' },
    { name: 'VIP Gold Pack', tokenAmount: 1000, bonusTokens: 200, priceMinorUnits: 9999, currency: 'USD' },
    { name: 'Ultimate Diamond Pack', tokenAmount: 2500, bonusTokens: 700, priceMinorUnits: 24999, currency: 'USD' },
  ];

  for (const pkg of tokenPackages) {
    const existing = await prisma.tokenPackage.findFirst({ where: { name: pkg.name } });
    if (!existing) {
      await prisma.tokenPackage.create({ data: pkg });
    }
  }

  // 3. Create Admin User
  const defaultPasswordHash = await argon2.hash('VeloraAdmin2026!');
  const adminEmail = 'admin@velora.live';
  let admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: defaultPasswordHash,
        username: 'velora_admin',
        displayName: 'Platform Admin',
        isEmailVerified: true,
        roles: {
          create: [{ role: Role.ADMINISTRATOR }, { role: Role.VIEWER }],
        },
        wallet: {
          create: {
            tokenBalance: 10000,
          },
        },
      },
    });
    console.log('Created Admin user:', adminEmail);
  }

  // 4. Create Verified Creator
  const creatorEmail = 'creator@velora.live';
  let creator = await prisma.user.findUnique({ where: { email: creatorEmail } });
  if (!creator) {
    const creatorPassHash = await argon2.hash('VeloraCreator2026!');
    creator = await prisma.user.create({
      data: {
        email: creatorEmail,
        passwordHash: creatorPassHash,
        username: 'velora_star',
        displayName: 'Aria Star',
        bio: 'Official Velora Verified Creator. Welcome to my live room!',
        isEmailVerified: true,
        roles: {
          create: [{ role: Role.VERIFIED_CREATOR }, { role: Role.VIEWER }],
        },
        creatorProfile: {
          create: {
            stageName: 'Aria Star',
            bio: 'Official Velora Verified Creator. Welcome to my live room!',
            isApproved: true,
            tipMenuEnabled: true,
            privateShowRatePerMinute: 60,
            groupShowRatePerMinute: 30,
            rating: 5.0,
            followerCount: 1540,
            tipMenuItems: {
              create: [
                { label: 'Say Hello / Shoutout', tokenPrice: 25, description: 'Personalized shoutout on stream', sortOrder: 1 },
                { label: 'Play Favorite Song', tokenPrice: 50, description: 'Queue your requested song', sortOrder: 2 },
                { label: 'Private Flash 1 min', tokenPrice: 150, description: 'Exclusive special reaction', sortOrder: 3 },
                { label: 'Dance Request', tokenPrice: 200, description: 'Special dynamic dance routine', sortOrder: 4 },
              ],
            },
          },
        },
        creatorApplication: {
          create: {
            status: ApplicationStatus.APPROVED,
            legalFirstName: 'Aria',
            legalLastName: 'Starling',
            dateOfBirth: new Date('1998-05-15'),
            country: 'US',
            idDocumentType: 'PASSPORT',
            idDocumentNumber: 'P987654321',
            reviewedAt: new Date(),
            reviewerNotes: 'Verified adult identity and compliant consent record.',
          },
        },
        wallet: {
          create: {
            tokenBalance: 250,
          },
        },
        payoutAccounts: {
          create: {
            payoutMethod: 'BANK_WIRE',
            accountReference: 'US98765432101234',
            currency: 'USD',
            isDefault: true,
            isVerified: true,
          },
        },
      },
    });

    // Create creator's default room
    const defaultCategory = await prisma.roomCategory.findFirst({ where: { slug: 'talk-chill' } });
    await prisma.streamRoom.create({
      data: {
        creatorId: creator.id,
        title: 'Aria’s Chill & Chat Lounge ✨',
        topic: 'Relaxing, music & interactive games',
        categoryId: defaultCategory?.id,
        isLive: false,
        allowChat: true,
        allowTips: true,
      },
    });
    console.log('Created Verified Creator:', creatorEmail);
  }

  // 5. Create Test Viewer
  const viewerEmail = 'viewer@velora.live';
  let viewer = await prisma.user.findUnique({ where: { email: viewerEmail } });
  if (!viewer) {
    const viewerPassHash = await argon2.hash('VeloraViewer2026!');
    viewer = await prisma.user.create({
      data: {
        email: viewerEmail,
        passwordHash: viewerPassHash,
        username: 'velora_fan_01',
        displayName: 'John Viewer',
        isEmailVerified: true,
        roles: {
          create: [{ role: Role.VIEWER }],
        },
        wallet: {
          create: {
            tokenBalance: 500,
          },
        },
      },
    });
    console.log('Created Test Viewer:', viewerEmail);
  }

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
