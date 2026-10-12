-- قیمت غذای کارمندی و مدیریتی هر رستوران
ALTER TABLE "restaurants" ADD COLUMN "employeeMealPrice" DECIMAL(18,0);
ALTER TABLE "restaurants" ADD COLUMN "managementMealPrice" DECIMAL(18,0);
