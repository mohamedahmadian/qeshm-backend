-- روزهای انتخاب‌شده برای رزرو پیشرفته (۰ شنبه … ۴ چهارشنبه)
ALTER TABLE "advanced_food_orders" ADD COLUMN "weekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
