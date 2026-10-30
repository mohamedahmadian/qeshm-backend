/**
 * داده نمایشی ماژول هیئت مدیره برای ارائه به مدیران.
 *
 * اجرا از پوشه backend:
 *   npm run seed:board-demo
 *
 * تکرار اجرا، طرح‌درخواست‌ها و صورت‌جلسه‌های همین اسکریپت را جایگزین می‌کند.
 * واحدها، کاربران، دارندگان حق امضا و پیمانکاران در صورت وجود دوباره ساخته نمی‌شوند.
 */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  type BoardMinutesStatus,
  type BoardRequestKind,
  type BoardRequestStatus,
  type BoardResolutionContractKind,
  type BoardResolutionContractStatus,
  type BoardResolutionDueKind,
  type BoardResolutionProposerKind,
  type BoardResolutionStatus,
  type BoardStage,
} from '../src/generated/prisma/client';
import { gregorianToJalali, parseJalaliSlashToIso } from '../src/common/jalali-date';
import { parseIsoDate } from '../src/common/iso-date';
import { EMPLOYEE_ROLE_CODE, BOARD_ADMIN_ROLE_CODE } from '../src/access/access.constants';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL as string,
});
const prisma = new PrismaClient({ adapter });

const DEMO_PASSWORD = 'Demo1234';

const MIN_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

type UnitKey =
  | 'board'
  | 'ceoOffice'
  | 'planVice'
  | 'civilVice'
  | 'econVice'
  | 'legal'
  | 'budget'
  | 'it'
  | 'hr'
  | 'port'
  | 'urban';

type UserKey =
  | 'ceo'
  | 'secretary'
  | 'planDeputy'
  | 'civilDeputy'
  | 'legalManager'
  | 'budgetManager'
  | 'itManager'
  | 'hrManager'
  | 'portManager'
  | 'urbanExpert'
  | 'econExpert';

type ContractorKey =
  | 'gulf'
  | 'qeshmpardaz'
  | 'sahil'
  | 'hormoz'
  | 'pak'
  | 'arya'
  | 'negin';

const UNIT_DEFS: {
  key: UnitKey;
  name: string;
  code: string;
  kind: string;
  parent?: UnitKey;
  keywords: string[];
  phone: string;
}[] = [
  {
    key: 'board',
    name: 'هیئت مدیره',
    code: 'BOARD-DEMO-BOARD',
    kind: 'BOARD',
    keywords: ['هیئت مدیره', 'هیات مدیره'],
    phone: '07635221001',
  },
  {
    key: 'ceoOffice',
    name: 'دفتر مدیرعامل',
    code: 'BOARD-DEMO-CEO',
    kind: 'OFFICE',
    keywords: ['مدیرعامل'],
    phone: '07635221002',
  },
  {
    key: 'planVice',
    name: 'معاونت برنامه‌ریزی و توسعه',
    code: 'BOARD-DEMO-PLAN',
    kind: 'VICE',
    keywords: ['برنامه‌ریزی', 'برنامه ریزی'],
    phone: '07635221003',
  },
  {
    key: 'civilVice',
    name: 'معاونت عمرانی',
    code: 'BOARD-DEMO-CIVIL',
    kind: 'VICE',
    keywords: ['عمران'],
    phone: '07635221004',
  },
  {
    key: 'econVice',
    name: 'معاونت اقتصادی و سرمایه‌گذاری',
    code: 'BOARD-DEMO-ECON',
    kind: 'VICE',
    keywords: ['اقتصاد', 'سرمایه‌گذاری', 'سرمایه گذاری'],
    phone: '07635221005',
  },
  {
    key: 'legal',
    name: 'مدیریت حقوقی و قراردادها',
    code: 'BOARD-DEMO-LEGAL',
    kind: 'MANAGEMENT',
    parent: 'planVice',
    keywords: ['حقوقی'],
    phone: '07635221006',
  },
  {
    key: 'budget',
    name: 'مدیریت طرح و برنامه',
    code: 'BOARD-DEMO-BUDGET',
    kind: 'MANAGEMENT',
    parent: 'planVice',
    keywords: ['بودجه', 'طرح و برنامه'],
    phone: '07635221007',
  },
  {
    key: 'it',
    name: 'مدیریت فناوری اطلاعات',
    code: 'BOARD-DEMO-IT',
    kind: 'MANAGEMENT',
    parent: 'planVice',
    keywords: ['فناوری', 'فاوا', 'اطلاعات'],
    phone: '07635221008',
  },
  {
    key: 'hr',
    name: 'مدیریت منابع انسانی',
    code: 'BOARD-DEMO-HR',
    kind: 'MANAGEMENT',
    parent: 'planVice',
    keywords: ['منابع انسانی', 'سرمایه انسانی'],
    phone: '07635221009',
  },
  {
    key: 'port',
    name: 'مدیریت بنادر و دریانوردی',
    code: 'BOARD-DEMO-PORT',
    kind: 'MANAGEMENT',
    parent: 'econVice',
    keywords: ['بندر'],
    phone: '07635221010',
  },
  {
    key: 'urban',
    name: 'مدیریت خدمات شهری',
    code: 'BOARD-DEMO-URBAN',
    kind: 'MANAGEMENT',
    parent: 'civilVice',
    keywords: ['خدمات شهری', 'زیربنایی'],
    phone: '07635221011',
  },
];

const USER_DEFS: {
  key: UserKey;
  username: string;
  firstName: string;
  lastName: string;
  unit: UnitKey;
  position: string;
  boardAdmin?: boolean;
}[] = [
  {
    key: 'ceo',
    username: 'demo.ceo',
    firstName: 'حسین',
    lastName: 'امینی',
    unit: 'ceoOffice',
    position: 'HEAD',
    boardAdmin: true,
  },
  {
    key: 'secretary',
    username: 'demo.secretary',
    firstName: 'زهرا',
    lastName: 'کریمی',
    unit: 'board',
    position: 'SECRETARY',
    boardAdmin: true,
  },
  {
    key: 'planDeputy',
    username: 'demo.plan',
    firstName: 'مهدی',
    lastName: 'رضایی',
    unit: 'planVice',
    position: 'DEPUTY',
  },
  {
    key: 'civilDeputy',
    username: 'demo.civil',
    firstName: 'علی',
    lastName: 'موسوی',
    unit: 'civilVice',
    position: 'DEPUTY',
  },
  {
    key: 'legalManager',
    username: 'demo.legal',
    firstName: 'سارا',
    lastName: 'نیک‌فر',
    unit: 'legal',
    position: 'MANAGER',
  },
  {
    key: 'budgetManager',
    username: 'demo.budget',
    firstName: 'رضا',
    lastName: 'قاسمی',
    unit: 'budget',
    position: 'MANAGER',
  },
  {
    key: 'itManager',
    username: 'demo.it',
    firstName: 'نگار',
    lastName: 'احمدی',
    unit: 'it',
    position: 'MANAGER',
  },
  {
    key: 'hrManager',
    username: 'demo.hr',
    firstName: 'فاطمه',
    lastName: 'صادقی',
    unit: 'hr',
    position: 'MANAGER',
  },
  {
    key: 'portManager',
    username: 'demo.port',
    firstName: 'کامران',
    lastName: 'حیدری',
    unit: 'port',
    position: 'MANAGER',
  },
  {
    key: 'urbanExpert',
    username: 'demo.urban',
    firstName: 'مینا',
    lastName: 'جعفری',
    unit: 'urban',
    position: 'EXPERT',
  },
  {
    key: 'econExpert',
    username: 'demo.econ',
    firstName: 'امیر',
    lastName: 'سلطانی',
    unit: 'econVice',
    position: 'EXPERT',
  },
];

const REQUESTS: {
  subject: string;
  unit: UnitKey;
  author: UserKey;
  positionText: string;
  kind?: BoardRequestKind;
  status: BoardRequestStatus;
  rejectedStage?: BoardStage;
  requestedAt: string;
  justification: string;
  topicHistory: string;
  description: string;
}[] = [
  {
    subject: 'استقرار سامانه نظارت تصویری بنادر قشم',
    unit: 'it',
    author: 'itManager',
    positionText: 'مدیر',
    status: 'PENDING_REVIEW',
    requestedAt: '1405/08/06',
    justification:
      'افزایش ایمنی تردد شناور و کاهش حوادث بندری نیازمند پوشش کامل دوربین در اسکله‌های بهمن و کاوه است.',
    topicHistory: 'در سال ۱۴۰۳ تنها محدوده درب ورودی پوشش داده شده و نقاط کور گزارش شده است.',
    description: 'درخواست تأمین و نصب سامانه نظارت تصویری با قابلیت ذخیره‌سازی مرکزی و دسترسی کنترل اتاق فرمان.',
  },
  {
    subject: 'بازسازی و بهسازی اسکله بهمن',
    unit: 'civilVice',
    author: 'civilDeputy',
    positionText: 'معاون',
    status: 'PENDING_LEGAL',
    requestedAt: '1405/07/18',
    justification:
      'فرسودگی سازه‌ای اسکله و گزارش بازدید ایمنی، ادامه بهره‌برداری بدون بهسازی را با خطر همراه کرده است.',
    topicHistory: 'طرح اولیه در جلسه ۱۴۰۴ بررسی شد اما به دلیل نقص مطالعات ژئوتکنیک متوقف ماند.',
    description: 'انجام مطالعات تکمیلی، تخریب موضعی، بتن‌ریزی عرشه و نوسازی تأسیسات پهلوگیری.',
  },
  {
    subject: 'واگذاری نگهداری فضای سبز منطقه آزاد',
    unit: 'urban',
    author: 'urbanExpert',
    positionText: 'کارشناس',
    status: 'PENDING_BUDGET',
    requestedAt: '1405/07/02',
    justification: 'هزینه نگهداری مستقیم فضای سبز نسبت به پیمان حجمی بالاتر است و کیفیت یکنواخت ندارد.',
    topicHistory: 'پیمان قبلی در اسفند ۱۴۰۴ خاتمه یافته و تمدید نشده است.',
    description: 'انتخاب پیمانکار نگهداری فضای سبز معابر اصلی، میادین و کمربند سبز فرودگاه.',
  },
  {
    subject: 'بازنگری آیین‌نامه مأموریت و فوق‌العاده شغل',
    unit: 'hr',
    author: 'hrManager',
    positionText: 'مدیر',
    status: 'PENDING_SECRETARY',
    requestedAt: '1405/06/20',
    justification:
      'آیین‌نامه فعلی با سطح پرداخت دستگاه‌های مشابه منطقه همخوانی ندارد و موجب نارضایتی نیروهای تخصصی شده است.',
    topicHistory: 'پیش‌نویس در کمیته منابع انسانی خرداد ۱۴۰۵ تصویب داخلی شده است.',
    description: 'تصویب اصلاحیه سقف مأموریت داخل و خارج از جزیره و فوق‌العاده جذب مشاغل تخصصی.',
  },
  {
    subject: 'افزایش سرمایه شرکت تابعه خدمات بندری',
    unit: 'econVice',
    author: 'econExpert',
    positionText: 'کارشناس',
    status: 'PENDING_CEO',
    requestedAt: '1405/06/08',
    justification: 'برای ورود به مناقصات بزرگ‌تر و بهبود نسبت کفایت سرمایه، افزایش سرمایه ضروری است.',
    topicHistory: 'گزارش حسابرسی ۱۴۰۴ این موضوع را به‌عنوان توصیه هیئت مدیره شرکت تابعه ذکر کرده است.',
    description: 'افزایش سرمایه از محل مطالبات حال‌شده سهامدار و آورده نقدی به میزان پانصد میلیارد ریال.',
  },
  {
    subject: 'قرارداد بهره‌برداری بندر کاوه',
    unit: 'port',
    author: 'portManager',
    positionText: 'مدیر',
    status: 'APPROVED',
    requestedAt: '1405/04/12',
    justification:
      'واگذاری بهره‌برداری با حفظ مالکیت سازمان، درآمد پایدار و ارتقای خدمات خطوط کشتیرانی را به همراه دارد.',
    topicHistory: 'فراخوان سرمایه‌گذاری در بهمن ۱۴۰۴ منتشر و سه پیشنهاد واجد شرایط ارزیابی شد.',
    description: 'انعقاد قرارداد بهره‌برداری پنج‌ساله با تعهد سرمایه‌گذاری در تجهیزات محوطه و دروازه هوشمند.',
  },
  {
    subject: 'طرح توسعه گردشگری ساحلی جنوب جزیره',
    unit: 'econVice',
    author: 'econExpert',
    positionText: 'کارشناس',
    status: 'APPROVED',
    requestedAt: '1405/03/22',
    justification: 'ظرفیت نوار ساحلی جنوب جزیره بدون طرح یکپارچه رها شده و فرصت درآمد گردشگری از دست می‌رود.',
    topicHistory: 'مطالعات امکان‌سنجی مشاور در اردیبهشت ۱۴۰۵ تحویل شده است.',
    description: 'تصویب کلیات طرح، تعیین محدوده و صدور مجوز برگزاری مناقصه خدمات مشاوره طراحی فاز دو.',
  },
  {
    subject: 'نوسازی ناوگان حمل‌ونقل سازمانی',
    unit: 'civilVice',
    author: 'civilDeputy',
    positionText: 'معاون',
    status: 'APPROVED',
    requestedAt: '1405/02/18',
    justification: 'میانگین عمر ناوگان از ۱۲ سال گذشته و هزینه تعمیرات از توجیه اقتصادی خارج شده است.',
    topicHistory: 'در بودجه ۱۴۰۵ ردیف جایگزینی ۱۰ دستگاه سواری و ۲ مینی‌بوس پیش‌بینی شده است.',
    description: 'مجوز خرید و جایگزینی خودروهای فرسوده از محل اعتبار مصوب سال جاری.',
  },
  {
    subject: 'استقرار سامانه یکپارچه اداری و مالی',
    unit: 'it',
    author: 'itManager',
    positionText: 'مدیر',
    status: 'APPROVED',
    requestedAt: '1405/01/28',
    justification:
      'پراکندگی سامانه‌های جزیره‌ای موجب دوباره‌کاری، تأخیر گزارش‌های مالی و ضعف کنترل داخلی شده است.',
    topicHistory: 'سند معماری سازمانی در زمستان ۱۴۰۴ به تصویب شورای تحول دیجیتال رسیده است.',
    description: 'انتخاب پیمانکار و شروع پیاده‌سازی ماژول‌های بودجه، قرارداد و منابع انسانی.',
  },
  {
    subject: 'خرید تجهیزات ایمنی و اطفای حریق بنادر',
    unit: 'port',
    author: 'portManager',
    positionText: 'مدیر',
    status: 'REJECTED',
    rejectedStage: 'LEGAL',
    requestedAt: '1405/05/14',
    justification: 'بازدید ایمنی آتش‌نشانی کمبود کپسول، هیدرانت و لباس عملیات را گزارش کرده است.',
    topicHistory: 'خرید مشابه در ۱۴۰۳ انجام شد اما بخشی از تجهیزات به انبار سایر واحدها منتقل گردید.',
    description: 'تأمین تجهیزات اطفای حریق محوطه و اسکله طبق فهرست آتش‌نشانی.',
  },
  {
    subject: 'مجوز استخدام نیروی قراردادی پشتیبانی',
    unit: 'hr',
    author: 'hrManager',
    positionText: 'مدیر',
    status: 'REJECTED',
    rejectedStage: 'MANAGEMENT',
    requestedAt: '1405/05/02',
    justification: 'کمبود نیرو در شیفت شب نگهبانی و خدمات پشتیبانی ساختمان مرکزی.',
    topicHistory: 'سقف مجوز استخدام سال ۱۴۰۵ تکمیل شده است.',
    description: 'درخواست ۱۲ نفر نیروی قراردادی خدمات و انتظامات.',
  },
  {
    subject: 'اجاره ساختمان اداری فاز توسعه',
    unit: 'hr',
    author: 'hrManager',
    positionText: 'مدیر',
    status: 'PENDING_REVIEW',
    requestedAt: '1405/08/03',
    justification: 'تراکم واحدها در ساختمان مرکزی پاسخگوی جذب نیروهای جدید طرح تحول نیست.',
    topicHistory: 'پیشنهاد سه ملک در شهرک گلزار بررسی کارشناسی شده است.',
    description: 'اجاره دو ساله یک ساختمان اداری با ظرفیت ۴۰ نفر و پارکینگ اختصاصی.',
  },
  {
    subject: 'احداث نیروگاه خورشیدی سه مگاواتی',
    unit: 'planVice',
    author: 'planDeputy',
    positionText: 'معاون',
    status: 'APPROVED',
    requestedAt: '1405/02/05',
    justification: 'کاهش وابستگی به شبکه سراسری و مدیریت پیک مصرف تأسیسات بندری.',
    topicHistory: 'زمین پیشنهادی در مجاورت پست برق بهمن با استعلام منابع طبیعی بلامانع اعلام شده است.',
    description: 'موافقت با سرمایه‌گذاری از محل مشارکت بخش خصوصی و تضمین خرید برق.',
  },
  {
    subject: 'توسعه شبکه فیبر نوری منطقه',
    unit: 'it',
    author: 'itManager',
    positionText: 'مدیر',
    status: 'APPROVED',
    requestedAt: '1404/11/24',
    justification: 'ارتباط پایدار بین ساختمان‌های ستادی، بنادر و مراکز خدماتی نیازمند فیبر اختصاصی است.',
    topicHistory: 'فاز اول در مسیر درگهان اجرا شده و فاز دوم معطل مصوبه هیئت مدیره مانده است.',
    description: 'اجرای فاز دوم فیبر نوری از میدان سعدی تا مجتمع بندری کاوه.',
  },
  {
    subject: 'لایروبی کانال دسترسی بندر شهید ذاکری',
    unit: 'port',
    author: 'portManager',
    positionText: 'مدیر',
    status: 'APPROVED',
    requestedAt: '1405/03/08',
    justification: 'کاهش عمق کانال ورود شناورهای بالای چهار هزار تن را محدود کرده است.',
    topicHistory: 'آخرین لایروبی در ۱۴۰۱ انجام شده و هیدروگرافی جدید کاهش عمق را تأیید می‌کند.',
    description: 'انجام لایروبی اضطراری و نگهداری با پایش سه‌ماهه عمق.',
  },
  {
    subject: 'قرارداد خدمات مشاوره حقوقی دعاوی',
    unit: 'legal',
    author: 'legalManager',
    positionText: 'مدیر',
    status: 'PENDING_BUDGET',
    requestedAt: '1405/07/28',
    justification: 'حجم پرونده‌های مطالبات پیمانکاران از ظرفیت کارشناسان داخلی فراتر رفته است.',
    topicHistory: 'دو پرونده در دیوان عدالت اداری در مرحله تبادل لایحه است.',
    description: 'انعقاد قرارداد یک‌ساله با مؤسسه حقوقی متخصص دعاوی اداری و پیمان.',
  },
  {
    subject: 'پرداخت تسهیلات رفاهی کارکنان',
    unit: 'ceoOffice',
    author: 'ceo',
    positionText: 'رئیس',
    kind: 'MANAGEMENT',
    status: 'PENDING_CEO',
    requestedAt: '1405/08/04',
    justification: 'بهبود معیشت کارکنان در آستانه نیمه دوم سال و همسویی با سیاست‌های رفاهی سازمان.',
    topicHistory: 'مشابه این تسهیلات در سال ۱۴۰۳ پس از تأیید هیئت مدیره پرداخت شد.',
    description: 'دستور بررسی و تصویب سقف وام ضروری و کمک‌هزینه تحصیلی فرزندان کارکنان.',
  },
  {
    subject: 'تعیین نماینده در کمیسیون ماده پنج',
    unit: 'ceoOffice',
    author: 'ceo',
    positionText: 'رئیس',
    kind: 'MANAGEMENT',
    status: 'APPROVED',
    requestedAt: '1405/04/28',
    justification: 'حضور مؤثر سازمان در تصمیم‌های تغییر کاربری اراضی محدوده منطقه آزاد ضروری است.',
    topicHistory: 'حکم نماینده قبلی در فروردین ۱۴۰۵ به پایان رسیده است.',
    description: 'معرفی معاون عمرانی به‌عنوان نماینده تام‌الاختیار سازمان در کمیسیون.',
  },
  {
    subject: 'کمپین تبلیغاتی جذب سرمایه‌گذار خارجی',
    unit: 'econVice',
    author: 'econExpert',
    positionText: 'کارشناس',
    status: 'PENDING_SECRETARY',
    requestedAt: '1405/06/26',
    justification: 'معرفی بسته‌های سرمایه‌گذاری بنادر و گردشگری در نمایشگاه‌های منطقه‌ای.',
    topicHistory: 'تقویم نمایشگاه‌های دبی و مسقط برای پاییز ۱۴۰۵ قطعی شده است.',
    description: 'تولید محتوای چندزبانه، غرفه و تبلیغات محیطی در دو رویداد بین‌المللی.',
  },
  {
    subject: 'اصلاح شبکه آب‌رسانی شهرک صنعتی',
    unit: 'urban',
    author: 'urbanExpert',
    positionText: 'کارشناس',
    status: 'PENDING_LEGAL',
    requestedAt: '1405/07/12',
    justification: 'افت فشار و شکستگی مکرر لوله‌های آزبست قدیمی تولید واحدهای صنعتی را مختل کرده است.',
    topicHistory: 'اعتبار مطالعات در بودجه عمرانی ۱۴۰۵ دیده شده اما اجرای کار نیازمند مصوبه است.',
    description: 'تعویض خطوط فرسوده و نصب شیرهای قطع اضطراری در سه بلوک شهرک.',
  },
];

const MINUTES: {
  key: string;
  subject: string;
  heldAt: string;
  status: BoardMinutesStatus;
  body: string;
  requestSubjects: string[];
  guests: { firstName: string; lastName: string; title: string; attendance?: 'PRESENT' | 'ABSENT' }[];
  absentUsers?: UserKey[];
}[] = [
  {
    key: 'm1',
    subject: 'یکصد و دوازدهمین جلسه عادی هیئت مدیره',
    heldAt: '1405/02/20',
    status: 'NOTIFIED',
    body: [
      'جلسه رأس ساعت ۹ در سالن جلسات ساختمان مرکزی تشکیل شد.',
      'پس از تلاوت قرآن، دستور جلسه شامل نوسازی ناوگان، سامانه اداری و نیروگاه خورشیدی قرائت گردید.',
      'اعضا با کلیات طرح‌ها موافقت و مقرر شد قراردادها با نظارت مدیریت طرح و برنامه منعقد شود.',
    ].join('\n'),
    requestSubjects: [
      'نوسازی ناوگان حمل‌ونقل سازمانی',
      'استقرار سامانه یکپارچه اداری و مالی',
      'احداث نیروگاه خورشیدی سه مگاواتی',
    ],
    guests: [
      { firstName: 'سعید', lastName: 'برومند', title: 'نماینده سازمان بنادر و دریانوردی' },
    ],
  },
  {
    key: 'm2',
    subject: 'جلسه فوق‌العاده بررسی طرح‌های عمرانی بنادر',
    heldAt: '1405/04/10',
    status: 'NOTIFIED',
    body: [
      'جلسه فوق‌العاده برای تعیین تکلیف بهره‌برداری بندر کاوه و لایروبی کانال شهید ذاکری برگزار شد.',
      'گزارش ارزیابی پیشنهادهای سرمایه‌گذاری قرائت و گزینه برتر با اکثریت آرا انتخاب گردید.',
      'مهلت ارائه برنامه زمان‌بندی پیمانکار لایروبی یک ماه تعیین شد.',
    ].join('\n'),
    requestSubjects: ['قرارداد بهره‌برداری بندر کاوه', 'لایروبی کانال دسترسی بندر شهید ذاکری'],
    guests: [
      { firstName: 'یوسف', lastName: 'شهریاری', title: 'مشاور هیدروگرافی' },
      { firstName: 'لیلا', lastName: 'فاضلی', title: 'نماینده معاونت اقتصادی', attendance: 'ABSENT' },
    ],
  },
  {
    key: 'm3',
    subject: 'یکصد و سیزدهمین جلسه عادی هیئت مدیره',
    heldAt: '1405/06/18',
    status: 'NOTIFIED',
    body: [
      'دستور جلسه شامل گردشگری ساحلی، نماینده کمیسیون ماده پنج و گزارش پیشرفت مصوبات قبلی بود.',
      'اعضا بر تسریع ابلاغ مصوبات و دریافت گزارش ماهانه از مجریان تأکید کردند.',
    ].join('\n'),
    requestSubjects: [
      'طرح توسعه گردشگری ساحلی جنوب جزیره',
      'تعیین نماینده در کمیسیون ماده پنج',
      'توسعه شبکه فیبر نوری منطقه',
    ],
    guests: [{ firstName: 'حسن', lastName: 'اکبری', title: 'نماینده شورای اسلامی شهر قشم' }],
  },
  {
    key: 'm4',
    subject: 'جلسه بررسی موضوعات فناوری و تحول دیجیتال',
    heldAt: '1405/07/25',
    status: 'HELD',
    body: [
      'وضعیت پروژه‌های فیبر نوری و سامانه یکپارچه بررسی شد.',
      'تأکید گردید امنیت اطلاعات و آموزش کاربران همزمان با استقرار سامانه دنبال شود.',
    ].join('\n'),
    requestSubjects: [],
    guests: [{ firstName: 'نیما', lastName: 'کاظمی', title: 'مشاور امنیت اطلاعات' }],
    absentUsers: ['urbanExpert'],
  },
  {
    key: 'm5',
    subject: 'یکصد و چهاردهمین جلسه عادی هیئت مدیره',
    heldAt: '1405/08/05',
    status: 'HELD',
    body: [
      'جلسه با حضور اکثریت اعضا تشکیل و گزارش دبیرخانه از طرح‌های در گردش قرائت شد.',
      'موضوع تسهیلات رفاهی کارکنان به جلسه بعد موکول گردید.',
    ].join('\n'),
    requestSubjects: [],
    guests: [],
  },
  {
    key: 'm6',
    subject: 'جلسه برنامه‌ریزی بودجه و مصوبات سال ۱۴۰۶',
    heldAt: '1405/08/20',
    status: 'NOT_HELD',
    body: 'جلسه برای بررسی پیش‌نویس بودجه عمرانی و اولویت مصوبات ناتمام سال ۱۴۰۵ زمان‌بندی شده است.',
    requestSubjects: [],
    guests: [{ firstName: 'پروین', lastName: 'نادری', title: 'نماینده سازمان برنامه و بودجه' }],
  },
];

type ExtraResolution = {
  minutesKey: string;
  title: string;
  description: string;
  requestSubject?: string;
  status: BoardResolutionStatus;
  dueKind: BoardResolutionDueKind;
  dueDate?: string;
  executors: UnitKey[];
  proposerKind: BoardResolutionProposerKind;
  proposerUnit?: UnitKey;
  proposerText?: string;
  legalBasis: string;
  notes: string;
  signed?: boolean;
  contracts?: {
    title: string;
    contractNo: string;
    contractor: ContractorKey;
    kind: BoardResolutionContractKind;
    status: BoardResolutionContractStatus;
    amount: number;
    paidAmount: number;
    duration: string;
    signedAt: string;
    startDate: string;
    endDate: string;
    supervisor: string;
    notes: string;
  }[];
  progress?: {
    reportedAt: string;
    title: string;
    category: string;
    body: string;
    actionsDone: string;
    nextPlan: string;
    blockers?: string;
    needs?: string;
    progressAmount: number;
    contractIndex?: number;
    contractor?: ContractorKey;
  }[];
};

const EXTRA_RESOLUTIONS: ExtraResolution[] = [
  {
    minutesKey: 'm1',
    title: 'تصویب کلیات احداث نیروگاه خورشیدی سه مگاواتی',
    description:
      'کلیات طرح با مدل مشارکت بخش خصوصی تصویب و معاونت برنامه‌ریزی مکلف به تهیه اسناد مناقصه شد.',
    requestSubject: 'احداث نیروگاه خورشیدی سه مگاواتی',
    status: 'NOTIFIED',
    dueKind: 'DATE',
    dueDate: '1405/06/31',
    executors: ['planVice', 'budget'],
    proposerKind: 'UNIT',
    proposerUnit: 'planVice',
    legalBasis: 'قانون تشویق سرمایه‌گذاری و مصوبه هیئت وزیران در خصوص انرژی‌های تجدیدپذیر',
    notes: 'تأکید شد اتصال به شبکه با هماهنگی توانیر پیش از امضای قرارداد نهایی مشخص شود.',
    signed: true,
    contracts: [
      {
        title: 'مطالعات و طراحی نیروگاه خورشیدی بهمن',
        contractNo: 'C-1405-011',
        contractor: 'sahil',
        kind: 'DESIGN_ENGINEERING',
        status: 'COMPLETED',
        amount: 8_400_000_000,
        paidAmount: 8_400_000_000,
        duration: '۴ ماه',
        signedAt: '1405/03/01',
        startDate: '1405/03/05',
        endDate: '1405/06/31',
        supervisor: 'مهدی رضایی',
        notes: 'گزارش نهایی مطالعات تحویل و صورت‌جلسه خاتمه تنظیم شده است.',
      },
      {
        title: 'مشارکت در احداث و بهره‌برداری نیروگاه',
        contractNo: 'C-1405-024',
        contractor: 'pak',
        kind: 'INVESTMENT',
        status: 'ACTIVE',
        amount: 185_000_000_000,
        paidAmount: 42_000_000_000,
        duration: '۱۸ ماه',
        signedAt: '1405/05/12',
        startDate: '1405/05/20',
        endDate: '1406/11/20',
        supervisor: 'رضا قاسمی',
        notes: 'پرداخت مرحله تجهیز کارگاه انجام شده است.',
      },
    ],
    progress: [
      {
        reportedAt: '1405/04/15',
        title: 'تحویل مطالعات ژئوتکنیک',
        category: 'مطالعات',
        body: 'گمانه‌زنی محل نیروگاه تکمیل و گزارش خاک به مشاور طراحی ارسال شد.',
        actionsDone: 'چهار گمانه و آزمایش مقاومت ویژه انجام شد.',
        nextPlan: 'نهایی‌سازی چیدمان پنل و مسیر کابل.',
        progressAmount: 35,
        contractIndex: 0,
      },
      {
        reportedAt: '1405/07/10',
        title: 'شروع تجهیز کارگاه',
        category: 'اجرایی',
        body: 'پیمانکار سرمایه‌گذار تجهیز کارگاه را آغاز کرده است.',
        actionsDone: 'حصارکشی موقت و استقرار کانکس عوامل.',
        nextPlan: 'سفارش پنل و اینورتر.',
        needs: 'صدور معرفی‌نامه گمرکی تجهیزات وارداتی.',
        progressAmount: 22,
        contractIndex: 1,
        contractor: 'pak',
      },
    ],
  },
  {
    minutesKey: 'm1',
    title: 'مجوز خرید و جایگزینی ناوگان سازمانی',
    description: 'خرید ۱۰ سواری و ۲ مینی‌بوس از محل اعتبار مصوب سال ۱۴۰۵ تأیید شد.',
    requestSubject: 'نوسازی ناوگان حمل‌ونقل سازمانی',
    status: 'NOTIFIED',
    dueKind: 'DATE',
    dueDate: '1405/08/15',
    executors: ['civilVice', 'budget'],
    proposerKind: 'UNIT',
    proposerUnit: 'civilVice',
    legalBasis: 'آیین‌نامه معاملات سازمان و ردیف بودجه تملک دارایی‌های سرمایه‌ای',
    notes: 'الزام به خرید از طریق سامانه ستاد و رعایت سقف معاملات.',
    signed: true,
    contracts: [
      {
        title: 'خرید خودروهای سازمانی',
        contractNo: 'C-1405-018',
        contractor: 'arya',
        kind: 'GOODS_EQUIPMENT',
        status: 'ACTIVE',
        amount: 64_500_000_000,
        paidAmount: 20_000_000_000,
        duration: '۶ ماه',
        signedAt: '1405/04/02',
        startDate: '1405/04/10',
        endDate: '1405/10/10',
        supervisor: 'علی موسوی',
        notes: 'پیش‌پرداخت پس از ارائه ضمانت‌نامه انجام شد.',
      },
    ],
    progress: [
      {
        reportedAt: '1405/06/01',
        title: 'ثبت سفارش و پیش‌پرداخت',
        category: 'تدارکات',
        body: 'ثبت سفارش شش دستگاه انجام و پیش‌پرداخت واریز شد.',
        actionsDone: 'انعقاد قرارداد و اخذ ضمانت‌نامه.',
        nextPlan: 'تحویل مرحله اول در مهر.',
        progressAmount: 40,
        contractIndex: 0,
      },
    ],
  },
  {
    minutesKey: 'm1',
    title: 'ابلاغ استقرار سامانه یکپارچه اداری و مالی',
    description: 'پیاده‌سازی سامانه در سه فاز بودجه، قرارداد و منابع انسانی تصویب شد.',
    requestSubject: 'استقرار سامانه یکپارچه اداری و مالی',
    status: 'NOTIFIED',
    dueKind: 'DATE',
    dueDate: '1405/12/15',
    executors: ['it', 'budget', 'hr'],
    proposerKind: 'UNIT',
    proposerUnit: 'it',
    legalBasis: 'سند معماری سازمانی و مصوبه شورای تحول دیجیتال',
    notes: 'آموزش کاربران کلیدی همزمان با فاز اول الزامی است.',
    signed: true,
    contracts: [
      {
        title: 'پیاده‌سازی سامانه یکپارچه اداری',
        contractNo: 'C-1405-009',
        contractor: 'qeshmpardaz',
        kind: 'INFORMATION_TECHNOLOGY',
        status: 'ACTIVE',
        amount: 38_700_000_000,
        paidAmount: 12_400_000_000,
        duration: '۱۲ ماه',
        signedAt: '1405/03/18',
        startDate: '1405/03/25',
        endDate: '1406/03/25',
        supervisor: 'نگار احمدی',
        notes: 'فاز بودجه روی محیط آزمایشی نصب شده است.',
      },
    ],
    progress: [
      {
        reportedAt: '1405/05/20',
        title: 'تحلیل فرایندهای بودجه',
        category: 'تحلیل',
        body: 'کارگاه‌های تحلیل با مدیریت طرح و برنامه برگزار شد.',
        actionsDone: 'مستندسازی ۲۰ فرایند اصلی.',
        nextPlan: 'پیکربندی ماژول بودجه.',
        progressAmount: 28,
        contractIndex: 0,
      },
      {
        reportedAt: '1405/07/22',
        title: 'نصب نسخه آزمایشی',
        category: 'اجرایی',
        body: 'نسخه آزمایشی روی سرور داخلی نصب و دسترسی مدیران آزمایش شد.',
        actionsDone: 'آماده‌سازی زیرساخت و مهاجرت داده نمونه.',
        nextPlan: 'آموزش کاربران بودجه.',
        blockers: 'تأخیر در تحویل کدینگ حساب‌ها از امور مالی.',
        progressAmount: 46,
        contractIndex: 0,
        contractor: 'qeshmpardaz',
      },
    ],
  },
  {
    minutesKey: 'm2',
    title: 'انعقاد قرارداد بهره‌برداری بندر کاوه',
    description: 'قرارداد پنج‌ساله بهره‌برداری با تعهد سرمایه‌گذاری تجهیزات محوطه تصویب شد.',
    requestSubject: 'قرارداد بهره‌برداری بندر کاوه',
    status: 'NOTIFIED',
    dueKind: 'DATE',
    dueDate: '1405/07/31',
    executors: ['port', 'legal', 'econVice'],
    proposerKind: 'UNIT',
    proposerUnit: 'port',
    legalBasis: 'قانون منطقه آزاد و آیین‌نامه سرمایه‌گذاری بنادر',
    notes: 'حفظ مالکیت اراضی و نظارت ایمنی بر عهده سازمان باقی می‌ماند.',
    signed: true,
    contracts: [
      {
        title: 'بهره‌برداری و تجهیز بندر کاوه',
        contractNo: 'C-1405-021',
        contractor: 'hormoz',
        kind: 'OPERATION',
        status: 'ACTIVE',
        amount: 240_000_000_000,
        paidAmount: 36_000_000_000,
        duration: '۵ سال',
        signedAt: '1405/05/05',
        startDate: '1405/05/15',
        endDate: '1410/05/15',
        supervisor: 'کامران حیدری',
        notes: 'ضمانت حسن انجام تعهد معادل ۱۰ درصد مبلغ سرمایه‌گذاری اخذ شد.',
      },
    ],
    progress: [
      {
        reportedAt: '1405/06/12',
        title: 'تحویل زمین و محوطه',
        category: 'تحویل',
        body: 'صورت‌جلسه تحویل محوطه غربی بندر تنظیم شد.',
        actionsDone: 'نصب تابلو و استقرار عوامل بهره‌بردار.',
        nextPlan: 'سفارش گنتری و باسکول.',
        progressAmount: 18,
        contractIndex: 0,
        contractor: 'hormoz',
      },
      {
        reportedAt: '1405/08/01',
        title: 'شروع عملیات دروازه هوشمند',
        category: 'اجرایی',
        body: 'عملیات پایه دروازه و اتاق کنترل آغاز شده است.',
        actionsDone: 'تسطیح و بتن مگر.',
        nextPlan: 'نصب تجهیزات پلاک‌خوان.',
        progressAmount: 33,
        contractIndex: 0,
      },
    ],
  },
  {
    minutesKey: 'm2',
    title: 'انجام لایروبی اضطراری کانال شهید ذاکری',
    description: 'لایروبی تا رسیدن به عمق طراحی و پایش سه‌ماهه تصویب شد.',
    requestSubject: 'لایروبی کانال دسترسی بندر شهید ذاکری',
    status: 'NOTIFIED',
    dueKind: 'DATE',
    dueDate: '1405/09/30',
    executors: ['port', 'civilVice'],
    proposerKind: 'UNIT',
    proposerUnit: 'port',
    legalBasis: 'ضوابط ایمنی دریایی و تعهدات نگهداری کانال دسترسی',
    notes: 'هماهنگی با جامعه محلی صیادی برای زمان عملیات الزامی است.',
    signed: true,
    contracts: [
      {
        title: 'لایروبی کانال دسترسی شهید ذاکری',
        contractNo: 'C-1405-027',
        contractor: 'gulf',
        kind: 'CONTRACTING',
        status: 'ACTIVE',
        amount: 96_000_000_000,
        paidAmount: 24_000_000_000,
        duration: '۸ ماه',
        signedAt: '1405/05/22',
        startDate: '1405/06/01',
        endDate: '1406/02/01',
        supervisor: 'علی موسوی',
        notes: 'شناور لایروب در محل مستقر شده است.',
      },
    ],
    progress: [
      {
        reportedAt: '1405/07/05',
        title: 'هیدروگرافی قبل از عملیات',
        category: 'مطالعات',
        body: 'نقشه عمق به‌روز تهیه و احجام لایروبی نهایی شد.',
        actionsDone: 'برداشت هیدروگرافی و تأیید مشاور.',
        nextPlan: 'شروع برداشت رسوب.',
        progressAmount: 20,
        contractIndex: 0,
      },
      {
        reportedAt: '1405/08/02',
        title: 'شروع برداشت رسوب',
        category: 'اجرایی',
        body: 'عملیات در جبهه غربی کانال آغاز شده است.',
        actionsDone: 'استقرار لایروب و تخلیه در محل مجاز.',
        nextPlan: 'تکمیل جبهه غربی تا پایان شهریور.',
        blockers: 'تأخیر دو روزه به دلیل شرایط جوی.',
        progressAmount: 38,
        contractIndex: 0,
        contractor: 'gulf',
      },
    ],
  },
  {
    minutesKey: 'm3',
    title: 'تصویب کلیات طرح گردشگری ساحلی جنوب جزیره',
    description: 'کلیات طرح تصویب و مجوز برگزاری مناقصه طراحی فاز دو صادر شد.',
    requestSubject: 'طرح توسعه گردشگری ساحلی جنوب جزیره',
    status: 'NOTIFIED',
    dueKind: 'DATE',
    dueDate: '1405/10/15',
    executors: ['econVice', 'urban'],
    proposerKind: 'UNIT',
    proposerUnit: 'econVice',
    legalBasis: 'سند توسعه گردشگری منطقه آزاد و ضوابط زیست‌محیطی ساحل',
    notes: 'حریم محیط زیست و مسیر دسترسی عمومی ساحل باید در طرح حفظ شود.',
    signed: true,
    contracts: [
      {
        title: 'مشاوره طراحی فاز دو گردشگری ساحلی',
        contractNo: 'C-1405-033',
        contractor: 'sahil',
        kind: 'CONSULTING',
        status: 'DRAFT',
        amount: 6_200_000_000,
        paidAmount: 0,
        duration: '۵ ماه',
        signedAt: '1405/07/01',
        startDate: '1405/07/10',
        endDate: '1405/12/10',
        supervisor: 'امیر سلطانی',
        notes: 'پیش‌نویس قرارداد نزد حقوقی در حال بررسی نهایی است.',
      },
    ],
    progress: [
      {
        reportedAt: '1405/07/20',
        title: 'تهیه اسناد مناقصه',
        category: 'اسناد',
        body: 'پیش‌نویس اسناد به حقوقی ارسال شده است.',
        actionsDone: 'تهیه شرح خدمات و برآورد.',
        nextPlan: 'انتشار آگهی پس از تأیید حقوقی.',
        progressAmount: 15,
      },
    ],
  },
  {
    minutesKey: 'm3',
    title: 'تعیین نماینده سازمان در کمیسیون ماده پنج',
    description: 'معاون عمرانی به‌عنوان نماینده تام‌الاختیار معرفی شد.',
    requestSubject: 'تعیین نماینده در کمیسیون ماده پنج',
    status: 'NOTIFIED',
    dueKind: 'ASAP',
    executors: ['civilVice', 'ceoOffice'],
    proposerKind: 'TEXT',
    proposerText: 'مدیرعامل سازمان',
    legalBasis: 'آیین‌نامه کمیسیون ماده پنج و تفویض اختیار هیئت مدیره',
    notes: 'حکم نمایندگی برای دو سال صادر شود.',
    signed: true,
  },
  {
    minutesKey: 'm3',
    title: 'ادامه اجرای فاز دوم فیبر نوری',
    description: 'فاز دوم فیبر نوری از میدان سعدی تا مجتمع بندری کاوه ابلاغ شد.',
    requestSubject: 'توسعه شبکه فیبر نوری منطقه',
    status: 'NOTIFIED',
    dueKind: 'DATE',
    dueDate: '1405/11/30',
    executors: ['it', 'civilVice'],
    proposerKind: 'UNIT',
    proposerUnit: 'it',
    legalBasis: 'مصوبه شورای تحول دیجیتال و ردیف ارتباطات بودجه ۱۴۰۵',
    notes: 'حفاری معابر با هماهنگی خدمات شهری و پلیس راهور انجام شود.',
    signed: true,
    contracts: [
      {
        title: 'اجرای فیبر نوری فاز دوم',
        contractNo: 'C-1404-088',
        contractor: 'qeshmpardaz',
        kind: 'INFORMATION_TECHNOLOGY',
        status: 'SUSPENDED',
        amount: 21_300_000_000,
        paidAmount: 9_800_000_000,
        duration: '۹ ماه',
        signedAt: '1404/12/10',
        startDate: '1404/12/20',
        endDate: '1405/09/20',
        supervisor: 'نگار احمدی',
        notes: 'عملیات به دلیل معارض تأسیسات آب به‌طور موقت متوقف است.',
      },
    ],
    progress: [
      {
        reportedAt: '1405/03/01',
        title: 'پیشرفت مسیر درگهان تا سعدی',
        category: 'اجرایی',
        body: 'کابل‌کشی مسیر اول تکمیل شده است.',
        actionsDone: '۴.۲ کیلومتر حفاری و کابل.',
        nextPlan: 'ادامه مسیر تا کاوه.',
        progressAmount: 55,
        contractIndex: 0,
      },
      {
        reportedAt: '1405/07/18',
        title: 'توقف موقت به دلیل معارض',
        category: 'چالش',
        body: 'برخورد با خط لوله آب موجب توقف جبهه دوم شد.',
        actionsDone: 'صورت‌جلسه معارض با خدمات شهری.',
        nextPlan: 'تغییر مسیر پس از استعلام.',
        blockers: 'عدم پاسخ استعلام آبفا.',
        needs: 'جلسه سه‌جانبه با آبفا و خدمات شهری.',
        progressAmount: 58,
        contractIndex: 0,
      },
    ],
  },
  {
    minutesKey: 'm4',
    title: 'الزام ارائه گزارش ماهانه پیشرفت مصوبات دیجیتال',
    description: 'مجریان پروژه‌های تحول دیجیتال مکلف به ارائه گزارش ماهانه به دبیرخانه شدند.',
    status: 'NOT_NOTIFIED',
    dueKind: 'DATE',
    dueDate: '1405/08/30',
    executors: ['it', 'planVice'],
    proposerKind: 'TEXT',
    proposerText: 'دبیر هیئت مدیره',
    legalBasis: 'آیین‌نامه داخلی هیئت مدیره در خصوص پیگیری مصوبات',
    notes: 'گزارش در قالب سامانه هیئت مدیره ثبت شود.',
  },
  {
    minutesKey: 'm4',
    title: 'قرارداد پشتیبانی سامانه پورتال سازمان',
    description: 'تمدید پشتیبانی پورتال و خدمات میزبانی برای یک سال تصویب شد.',
    status: 'NOTIFIED',
    dueKind: 'DATE',
    dueDate: '1405/09/15',
    executors: ['it'],
    proposerKind: 'UNIT',
    proposerUnit: 'it',
    legalBasis: 'آیین‌نامه معاملات در سقف معاملات متوسط',
    notes: 'سطح خدمت پاسخگویی حداکثر چهار ساعت در روزهای کاری.',
    signed: true,
    contracts: [
      {
        title: 'پشتیبانی و میزبانی پورتال',
        contractNo: 'C-1405-041',
        contractor: 'qeshmpardaz',
        kind: 'SERVICES',
        status: 'ACTIVE',
        amount: 4_800_000_000,
        paidAmount: 1_200_000_000,
        duration: '۱۲ ماه',
        signedAt: '1405/07/28',
        startDate: '1405/08/01',
        endDate: '1406/08/01',
        supervisor: 'نگار احمدی',
        notes: 'پرداخت فصلی پس از تأیید کارکرد.',
      },
    ],
    progress: [
      {
        reportedAt: '1405/08/07',
        title: 'تحویل دوره پشتیبانی',
        category: 'پشتیبانی',
        body: 'دوره جدید پشتیبانی آغاز و دسترسی‌ها بازبینی شد.',
        actionsDone: 'تمدید گواهی SSL و پشتیبان‌گیری.',
        nextPlan: 'آزمون نفوذ دوره‌ای.',
        progressAmount: 12,
        contractIndex: 0,
      },
    ],
  },
  {
    minutesKey: 'm5',
    title: 'کمپین معرفی فرصت‌های سرمایه‌گذاری',
    description: 'کلیات حضور در نمایشگاه‌های دبی و مسقط تصویب و جزئیات بودجه به جلسه بعد موکول شد.',
    requestSubject: 'کمپین تبلیغاتی جذب سرمایه‌گذار خارجی',
    status: 'NOT_NOTIFIED',
    dueKind: 'DATE',
    dueDate: '1405/09/20',
    executors: ['econVice'],
    proposerKind: 'UNIT',
    proposerUnit: 'econVice',
    legalBasis: 'برنامه سالانه روابط عمومی و جذب سرمایه',
    notes: 'سقف هزینه پس از نظر بودجه در جلسه بعد تعیین می‌شود.',
    contracts: [
      {
        title: 'خدمات تبلیغات و غرفه‌آرایی',
        contractNo: 'C-1405-044',
        contractor: 'negin',
        kind: 'MARKETING',
        status: 'DRAFT',
        amount: 3_150_000_000,
        paidAmount: 0,
        duration: '۳ ماه',
        signedAt: '1405/08/01',
        startDate: '1405/08/10',
        endDate: '1405/11/10',
        supervisor: 'امیر سلطانی',
        notes: 'منتظر تأیید نهایی بودجه نمایشگاه.',
      },
    ],
  },
  {
    minutesKey: 'm5',
    title: 'فسخ پیمان حجمی فضای سبز سال قبل',
    description:
      'با توجه به خاتمه موضوعی پیمان قبلی و عدم تمدید، فسخ توافقی و تسویه حساب نهایی تأیید شد.',
    status: 'NOTIFIED',
    dueKind: 'ASAP',
    executors: ['urban', 'legal'],
    proposerKind: 'UNIT',
    proposerUnit: 'urban',
    legalBasis: 'شرایط عمومی پیمان و نظریه حقوقی',
    notes: 'مطالبات باقی‌مانده پس از تأیید صورت‌وضعیت نهایی پرداخت شود.',
    signed: true,
    contracts: [
      {
        title: 'نگهداری فضای سبز معابر اصلی',
        contractNo: 'C-1404-052',
        contractor: 'gulf',
        kind: 'SERVICES',
        status: 'TERMINATED',
        amount: 11_200_000_000,
        paidAmount: 9_600_000_000,
        duration: '۱۲ ماه',
        signedAt: '1404/01/20',
        startDate: '1404/02/01',
        endDate: '1405/02/01',
        supervisor: 'مینا جعفری',
        notes: 'فسخ توافقی پس از خاتمه مدت و صورت‌جلسه تحویل.',
      },
    ],
  },
];

const CONTRACTOR_DEFS: {
  key: ContractorKey;
  name: string;
  type: string;
  ceoName: string;
  phone: string;
  nationalId: string;
  registrationNumber: string;
  description: string;
}[] = [
  {
    key: 'gulf',
    name: 'شرکت راه و ابنیه خلیج فارس',
    type: 'پیمانکاری عمرانی',
    ceoName: 'محمود اسدی',
    phone: '07635224001',
    nationalId: '14004567812',
    registrationNumber: '44120',
    description: 'پیمانکار طرح‌های عمرانی، لایروبی و ابنیه بندری.',
  },
  {
    key: 'qeshmpardaz',
    name: 'شرکت فناوری اطلاعات قشم‌پرداز',
    type: 'فناوری اطلاعات',
    ceoName: 'الهام مرادی',
    phone: '07635224002',
    nationalId: '14005891234',
    registrationNumber: '55231',
    description: 'توسعه نرم‌افزار، زیرساخت شبکه و پشتیبانی سامانه‌های سازمانی.',
  },
  {
    key: 'sahil',
    name: 'مؤسسه مشاوران توسعه سواحل',
    type: 'مشاوره',
    ceoName: 'کیوان رستمی',
    phone: '07635224003',
    nationalId: '14006712345',
    registrationNumber: '31880',
    description: 'مطالعات، طراحی و نظارت طرح‌های ساحلی و انرژی.',
  },
  {
    key: 'hormoz',
    name: 'شرکت خدمات بندری هرمزگان',
    type: 'بهره‌برداری',
    ceoName: 'ناصر بهرامی',
    phone: '07635224004',
    nationalId: '14007123456',
    registrationNumber: '22904',
    description: 'بهره‌برداری بنادر، تجهیزات محوطه و خدمات خطوط کشتیرانی.',
  },
  {
    key: 'pak',
    name: 'شرکت انرژی پاک جنوب',
    type: 'سرمایه‌گذاری',
    ceoName: 'شیرین کاظمی',
    phone: '07635224005',
    nationalId: '14008234567',
    registrationNumber: '61012',
    description: 'سرمایه‌گذاری و اجرای نیروگاه‌های تجدیدپذیر.',
  },
  {
    key: 'arya',
    name: 'شرکت حمل‌ونقل دریایی آریا',
    type: 'حمل‌ونقل',
    ceoName: 'بهروز نعمتی',
    phone: '07635224006',
    nationalId: '14009345678',
    registrationNumber: '77401',
    description: 'تأمین خودرو، حمل تجهیزات و خدمات لجستیک.',
  },
  {
    key: 'negin',
    name: 'شرکت تبلیغات نگین قشم',
    type: 'خدمات',
    ceoName: 'مریم اکبری',
    phone: '07635224007',
    nationalId: '14010456789',
    registrationNumber: '88320',
    description: 'تبلیغات، غرفه‌آرایی و تولید محتوای رویدادهای سرمایه‌گذاری.',
  },
];

const SIGNATORY_DEFS: {
  firstName: string;
  lastName: string;
  title: string;
  user?: UserKey;
  sortOrder: number;
}[] = [
  { firstName: 'حسین', lastName: 'امینی', title: 'رئیس هیئت مدیره / مدیرعامل', user: 'ceo', sortOrder: 1 },
  { firstName: 'محسن', lastName: 'طاهری', title: 'نایب رئیس هیئت مدیره', sortOrder: 2 },
  { firstName: 'زهرا', lastName: 'کریمی', title: 'دبیر هیئت مدیره', user: 'secretary', sortOrder: 3 },
  { firstName: 'علیرضا', lastName: 'پناهی', title: 'عضو هیئت مدیره', sortOrder: 4 },
  { firstName: 'مریم', lastName: 'شریفی', title: 'عضو هیئت مدیره', sortOrder: 5 },
];

function requireIso(jalali: string) {
  const iso = parseJalaliSlashToIso(jalali);
  if (!iso) throw new Error(`تاریخ نامعتبر: ${jalali}`);
  return iso;
}

function dateOnly(jalali: string) {
  return parseIsoDate(requireIso(jalali));
}

function dateTime(jalali: string, hour: string) {
  return new Date(`${requireIso(jalali)}T${hour}:00+03:30`);
}

function jalaliYear(iso: string) {
  const [year, month, day] = iso.split('-').map(Number);
  return gregorianToJalali(year, month, day).year;
}

function addDays(base: Date, days: number) {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

function matchUnit(
  existing: { id: string; name: string; code: string }[],
  def: (typeof UNIT_DEFS)[number],
) {
  return (
    existing.find((item) => item.code === def.code) ||
    existing.find((item) => item.name === def.name) ||
    existing.find((item) => def.keywords.some((word) => item.name.includes(word)))
  );
}

async function createSignatureImage() {
  try {
    const { Jimp } = await import('jimp');
    const image = new Jimp({ width: 320, height: 96, color: 0xffffffff });
    const ink = 0x0f766eff;
    for (let x = 18; x < 300; x += 1) {
      const y =
        50 +
        Math.round(16 * Math.sin(x / 22) + 9 * Math.sin(x / 8) + 3 * Math.sin(x / 3.4));
      for (let dy = -2; dy <= 2; dy += 1) {
        const py = y + dy;
        if (py >= 0 && py < 96) image.setPixelColor(ink, x, py);
      }
    }
    const data = Buffer.from(await image.getBuffer('image/png'));
    return prisma.storedImage.create({
      data: {
        mimeType: 'image/png',
        data,
        byteSize: data.length,
        width: 320,
        height: 96,
        originalName: 'board-demo-signature.png',
      },
    });
  } catch {
    return prisma.storedImage.create({
      data: {
        mimeType: 'image/png',
        data: MIN_PNG,
        byteSize: MIN_PNG.length,
        width: 1,
        height: 1,
        originalName: 'board-demo-signature.png',
      },
    });
  }
}

async function ensureKindsAndPositions() {
  const kindRows = await prisma.organizationUnitKind.findMany();
  const kindByCode = new Map(kindRows.map((item) => [item.code, item]));
  const needed = ['BOARD', 'OFFICE', 'VICE', 'MANAGEMENT', 'DEPARTMENT'];
  for (const code of needed) {
    if (kindByCode.get(code)) continue;
    const created = await prisma.organizationUnitKind.create({
      data: { code, name: code, isSystem: true },
    });
    kindByCode.set(code, created);
  }
  const positions = await prisma.organizationPosition.findMany();
  const positionByCode = new Map(positions.map((item) => [item.code, item]));
  return { kindByCode, positionByCode };
}

async function ensureUnits(
  kindByCode: Map<string | null, { id: string; code: string | null }>,
) {
  const existing = await prisma.organizationUnit.findMany({
    select: { id: true, name: true, code: true },
  });
  const map = {} as Record<UnitKey, { id: string; name: string }>;
  for (const def of UNIT_DEFS) {
    const found = matchUnit(existing, def);
    if (found) {
      map[def.key] = { id: found.id, name: found.name };
    }
  }
  for (const def of UNIT_DEFS) {
    if (map[def.key]) continue;
    const kind = kindByCode.get(def.kind);
    if (!kind) throw new Error(`نوع واحد ${def.kind} پیدا نشد`);
    const parentId = def.parent ? map[def.parent]?.id : undefined;
    const created = await prisma.organizationUnit.create({
      data: {
        name: def.name,
        code: def.code,
        kindId: kind.id,
        parentId: parentId ?? null,
        phone: def.phone,
      },
    });
    existing.push(created);
    map[def.key] = { id: created.id, name: created.name };
  }
  const fallback = existing[0];
  if (!fallback) throw new Error('هیچ واحد سازمانی برای ثبت داده نمایشی وجود ندارد');
  for (const def of UNIT_DEFS) {
    if (!map[def.key]) map[def.key] = { id: fallback.id, name: fallback.name };
  }
  return map;
}

async function ensureUsers(
  units: Record<UnitKey, { id: string; name: string }>,
  positionByCode: Map<string | null, { id: string; code: string | null; name: string }>,
) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const employeeRole = await prisma.role.findUnique({ where: { code: EMPLOYEE_ROLE_CODE } });
  const boardAdminRole = await prisma.role.findUnique({
    where: { code: BOARD_ADMIN_ROLE_CODE },
  });
  const admin = await prisma.user.findUnique({ where: { username: 'admin' } });
  if (!admin) throw new Error('کاربر admin پیدا نشد؛ ابتدا seed اصلی را اجرا کنید');

  const map = {} as Record<UserKey, { id: string; firstName: string; lastName: string }>;
  for (const def of USER_DEFS) {
    const position = positionByCode.get(def.position);
    const user = await prisma.user.upsert({
      where: { username: def.username },
      update: {
        firstName: def.firstName,
        lastName: def.lastName,
        fullName: `${def.firstName} ${def.lastName}`,
        status: 'ACTIVE',
        orgUnitId: units[def.unit].id,
        positionId: position?.id ?? null,
      },
      create: {
        username: def.username,
        passwordHash,
        firstName: def.firstName,
        lastName: def.lastName,
        fullName: `${def.firstName} ${def.lastName}`,
        locale: 'fa',
        status: 'ACTIVE',
        orgUnitId: units[def.unit].id,
        positionId: position?.id ?? null,
      },
    });
    map[def.key] = { id: user.id, firstName: user.firstName, lastName: user.lastName };
    if (employeeRole) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: employeeRole.id } },
        update: {},
        create: { userId: user.id, roleId: employeeRole.id },
      });
    }
    if (def.boardAdmin && boardAdminRole) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: boardAdminRole.id } },
        update: {},
        create: { userId: user.id, roleId: boardAdminRole.id },
      });
    }
  }
  return { admin, users: map };
}

async function ensurePermissions(
  units: Record<UnitKey, { id: string; name: string }>,
  positionByCode: Map<string | null, { id: string; code: string | null }>,
) {
  const stageUnits: { stage: BoardStage; unit: UnitKey }[] = [
    { stage: 'LEGAL', unit: 'legal' },
    { stage: 'BUDGET', unit: 'budget' },
    { stage: 'SECRETARY', unit: 'board' },
    { stage: 'CEO', unit: 'ceoOffice' },
  ];
  for (const item of stageUnits) {
    await prisma.boardStageUnit.upsert({
      where: { stage_unitId: { stage: item.stage, unitId: units[item.unit].id } },
      update: {},
      create: { stage: item.stage, unitId: units[item.unit].id },
    });
  }
  const positionCodes = ['DEPUTY', 'MANAGER', 'HEAD', 'SECRETARY'];
  const stages: BoardStage[] = ['LEGAL', 'BUDGET', 'SECRETARY', 'CEO'];
  for (const stage of stages) {
    for (const code of positionCodes) {
      const position = positionByCode.get(code);
      if (!position) continue;
      await prisma.boardStagePosition.upsert({
        where: { stage_positionId: { stage, positionId: position.id } },
        update: {},
        create: { stage, positionId: position.id },
      });
    }
  }
}

async function ensureContractors() {
  let project = await prisma.project.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!project) {
    project = await prisma.project.create({
      data: {
        systemName: 'پروژه پیگیری مصوبات هیئت مدیره',
        code: 'BOARD-DEMO-PROJECT',
        isActive: true,
        status: 'IN_PROGRESS',
        description: 'پروژه پشتیبان ثبت پیمانکاران مرتبط با مصوبات هیئت مدیره.',
      },
    });
  }
  const types = new Map<string, string>();
  const contractors = {} as Record<ContractorKey, { id: string; name: string }>;
  for (const def of CONTRACTOR_DEFS) {
    let type = await prisma.projectContractorType.findUnique({ where: { name: def.type } });
    if (!type) {
      type = await prisma.projectContractorType.create({ data: { name: def.type } });
    }
    types.set(def.type, type.id);
    const existing = await prisma.projectContractor.findFirst({
      where: { name: def.name },
    });
    const row =
      existing ??
      (await prisma.projectContractor.create({
        data: {
          projectId: project.id,
          typeId: type.id,
          name: def.name,
          ceoName: def.ceoName,
          phone: def.phone,
          nationalId: def.nationalId,
          registrationNumber: def.registrationNumber,
          description: def.description,
          contractStartDate: dateOnly('1404/01/15'),
          contractEndDate: dateOnly('1406/12/29'),
        },
      }));
    if (existing) {
      await prisma.projectContractor.update({
        where: { id: existing.id },
        data: {
          typeId: type.id,
          ceoName: def.ceoName,
          description: def.description,
        },
      });
    } else {
      await prisma.projectContractorMember.createMany({
        data: [
          {
            contractorId: row.id,
            firstName: def.ceoName.split(' ')[0] ?? def.ceoName,
            lastName: def.ceoName.split(' ').slice(1).join(' ') || def.name,
            role: 'مدیرعامل',
            phone: def.phone,
          },
        ],
      });
    }
    contractors[def.key] = { id: row.id, name: row.name };
  }
  return contractors;
}

async function ensureSignatories(
  users: Record<UserKey, { id: string; firstName: string; lastName: string }>,
) {
  const existingImage = await prisma.boardSignatory.findFirst({
    select: { signatureImageId: true },
  });
  const image = existingImage
    ? { id: existingImage.signatureImageId }
    : await createSignatureImage();
  const rows = [];
  for (const def of SIGNATORY_DEFS) {
    const existing = await prisma.boardSignatory.findFirst({
      where: { firstName: def.firstName, lastName: def.lastName, title: def.title },
    });
    const userId = def.user ? users[def.user].id : null;
    const row =
      existing ??
      (await prisma.boardSignatory.create({
        data: {
          firstName: def.firstName,
          lastName: def.lastName,
          title: def.title,
          signatureImageId: image.id,
          userId,
          sortOrder: def.sortOrder,
        },
      }));
    if (existing) {
      await prisma.boardSignatory.update({
        where: { id: existing.id },
        data: { sortOrder: def.sortOrder, userId: userId ?? existing.userId },
      });
    }
    rows.push(row);
  }
  return rows;
}

function reviewFields(
  status: BoardRequestStatus,
  kind: BoardRequestKind,
  requestedAt: Date,
  users: Record<UserKey, { id: string }>,
  rejectedStage?: BoardStage,
) {
  const managementAt = addDays(requestedAt, 1);
  const legalAt = addDays(requestedAt, 3);
  const budgetAt = addDays(requestedAt, 5);
  const secretaryAt = addDays(requestedAt, 7);
  const ceoAt = addDays(requestedAt, 9);
  const base: Record<string, unknown> = {};
  const fillThrough: BoardRequestStatus[] = [
    'PENDING_LEGAL',
    'PENDING_BUDGET',
    'PENDING_SECRETARY',
    'PENDING_CEO',
    'APPROVED',
    'REJECTED',
  ];
  if (kind === 'MANAGEMENT') {
    if (status === 'APPROVED' || (status === 'REJECTED' && rejectedStage === 'CEO')) {
      base.ceoReferredAt = addDays(requestedAt, 0);
    } else if (status === 'PENDING_CEO') {
      base.ceoReferredAt = requestedAt;
    }
    if (status === 'APPROVED') {
      base.ceoComment = 'با پرداخت تسهیلات در سقف پیشنهادی موافقت می‌شود.';
      base.ceoAt = ceoAt;
      base.ceoById = users.ceo.id;
    }
    if (status === 'REJECTED') {
      base.rejectedStage = rejectedStage ?? 'CEO';
      base.rejectedComment = 'موضوع نیازمند تأمین اعتبار جداگانه در اصلاحیه بودجه است.';
      base.rejectedAt = addDays(requestedAt, 2);
      base.rejectedById = users.ceo.id;
    }
    return base;
  }

  const needsManagement =
    fillThrough.includes(status) &&
    !(status === 'REJECTED' && rejectedStage === 'MANAGEMENT') &&
    status !== 'PENDING_REVIEW';
  if (status === 'REJECTED' && rejectedStage === 'MANAGEMENT') {
    base.rejectedStage = 'MANAGEMENT';
    base.rejectedComment = 'سقف مجوز استخدام سال جاری تکمیل است؛ از محل جابه‌جایی نیرو تأمین شود.';
    base.rejectedAt = managementAt;
    base.rejectedById = users.planDeputy.id;
    return base;
  }
  if (needsManagement || status === 'PENDING_LEGAL' || status === 'APPROVED') {
    base.managementComment = 'موضوع از نظر اولویت معاونت تأیید و به حقوقی ارجاع می‌شود.';
    base.managementAt = managementAt;
    base.managementById = users.planDeputy.id;
    base.legalReferredAt = managementAt;
  }
  if (status === 'PENDING_REVIEW') return base;

  if (status === 'REJECTED' && rejectedStage === 'LEGAL') {
    base.legalOrgMatch = false;
    base.legalRegulationsMatch = false;
    base.legalComment = 'فهرست تجهیزات با استاندارد اعلام‌شده آتش‌نشانی تطبیق کامل ندارد.';
    base.legalAt = legalAt;
    base.legalById = users.legalManager.id;
    base.rejectedStage = 'LEGAL';
    base.rejectedComment = 'پس از تکمیل مشخصات فنی و استعلام استاندارد مجدداً ارسال شود.';
    base.rejectedAt = legalAt;
    base.rejectedById = users.legalManager.id;
    return base;
  }

  const afterLegal: BoardRequestStatus[] = [
    'PENDING_BUDGET',
    'PENDING_SECRETARY',
    'PENDING_CEO',
    'APPROVED',
  ];
  if (afterLegal.includes(status) || status === 'PENDING_LEGAL') {
    if (status !== 'PENDING_LEGAL') {
      base.legalOrgMatch = true;
      base.legalRegulationsMatch = true;
      base.legalComment = 'از نظر حقوقی و مطابقت با مقررات بلامانع است.';
      base.legalAt = legalAt;
      base.legalById = users.legalManager.id;
      base.budgetReferredAt = legalAt;
    }
  }
  if (status === 'PENDING_LEGAL') return base;

  const afterBudget: BoardRequestStatus[] = ['PENDING_SECRETARY', 'PENDING_CEO', 'APPROVED'];
  if (afterBudget.includes(status) || status === 'PENDING_BUDGET') {
    if (status !== 'PENDING_BUDGET') {
      base.budgetProgramHistory = true;
      base.budgetCurrentYearFunding = true;
      base.budgetComment = 'اعتبار از محل ردیف مصوب سال جاری قابل تأمین است.';
      base.budgetAt = budgetAt;
      base.budgetById = users.budgetManager.id;
      base.secretaryReferredAt = budgetAt;
    }
  }
  if (status === 'PENDING_BUDGET') return base;

  if (status === 'PENDING_SECRETARY') return base;

  if (status === 'PENDING_CEO' || status === 'APPROVED') {
    base.secretaryComment = 'برای طرح در دستور جلسه هیئت مدیره تأیید می‌شود.';
    base.secretaryAt = secretaryAt;
    base.secretaryById = users.secretary.id;
    base.ceoReferredAt = secretaryAt;
  }
  if (status === 'PENDING_CEO') return base;

  if (status === 'APPROVED') {
    base.ceoComment = 'موضوع تأیید و جهت درج در صورت‌جلسه ابلاغ می‌شود.';
    base.ceoAt = ceoAt;
    base.ceoById = users.ceo.id;
  }
  return base;
}

async function resetBoardDemo() {
  const requestSubjects = REQUESTS.map((item) => item.subject);
  const minutesSubjects = MINUTES.map((item) => item.subject);
  const minutesDeleted = await prisma.boardMinutes.deleteMany({
    where: { subject: { in: minutesSubjects } },
  });
  const requestsDeleted = await prisma.boardRequest.deleteMany({
    where: { subject: { in: requestSubjects } },
  });
  return { minutesDeleted: minutesDeleted.count, requestsDeleted: requestsDeleted.count };
}

async function seedRequests(
  units: Record<UnitKey, { id: string; name: string }>,
  users: Record<UserKey, { id: string }>,
) {
  const created = new Map<string, { id: string; subject: string }>();
  const seqByYear = new Map<number, number>();
  for (const item of REQUESTS) {
    const iso = requireIso(item.requestedAt);
    const requestedAt = dateOnly(item.requestedAt);
    const trackingYear = jalaliYear(iso);
    if (!seqByYear.has(trackingYear)) {
      const last = await prisma.boardRequest.findFirst({
        where: { trackingYear },
        orderBy: { trackingSeq: 'desc' },
        select: { trackingSeq: true },
      });
      seqByYear.set(trackingYear, last?.trackingSeq ?? 0);
    }
    const trackingSeq = (seqByYear.get(trackingYear) ?? 0) + 1;
    seqByYear.set(trackingYear, trackingSeq);
    const kind = item.kind ?? 'NORMAL';
    const row = await prisma.boardRequest.create({
      data: {
        kind,
        status: item.status,
        requestedAt,
        trackingYear,
        trackingSeq,
        trackingNo: `${trackingYear}/${trackingSeq}`,
        unitId: units[item.unit].id,
        orgPositionText: item.positionText,
        subject: item.subject,
        justification: item.justification,
        topicHistory: item.topicHistory,
        description: item.description,
        createdById: users[item.author].id,
        createdAt: dateTime(item.requestedAt, '09:15'),
        ...reviewFields(item.status, kind, requestedAt, users, item.rejectedStage),
      },
    });
    created.set(item.subject, { id: row.id, subject: row.subject });
  }
  return created;
}

async function seedMinutes(
  units: Record<UnitKey, { id: string; name: string }>,
  users: Record<UserKey, { id: string; firstName: string; lastName: string }>,
  signatories: { id: string; firstName: string; lastName: string; title: string; signatureImageId: string }[],
  requests: Map<string, { id: string; subject: string }>,
  contractors: Record<ContractorKey, { id: string; name: string }>,
  createdById: string,
) {
  const minutesIds = new Map<string, string>();
  const seqByYear = new Map<number, number>();
  for (const item of MINUTES) {
    const iso = requireIso(item.heldAt);
    const minutesYear = jalaliYear(iso);
    if (!seqByYear.has(minutesYear)) {
      const last = await prisma.boardMinutes.findFirst({
        where: { minutesYear },
        orderBy: { minutesSeq: 'desc' },
        select: { minutesSeq: true },
      });
      seqByYear.set(minutesYear, last?.minutesSeq ?? 0);
    }
    const minutesSeq = (seqByYear.get(minutesYear) ?? 0) + 1;
    seqByYear.set(minutesYear, minutesSeq);
    const requestIds = item.requestSubjects
      .map((subject) => requests.get(subject)?.id)
      .filter((id): id is string => Boolean(id));
    const linkedUserIds = new Set(
      SIGNATORY_DEFS.flatMap((row) =>
        row.user && row.sortOrder <= 4 ? [users[row.user].id] : [],
      ),
    );
    const members = [
      ...USER_DEFS.filter((def) => !linkedUserIds.has(users[def.key].id)).map((def) => ({
        kind: 'USER' as const,
        userId: users[def.key].id,
        firstName: users[def.key].firstName,
        lastName: users[def.key].lastName,
        title: def.position === 'HEAD' ? 'مدیرعامل' : def.position === 'SECRETARY' ? 'دبیر' : null,
        attendance: (item.absentUsers ?? []).includes(def.key) ? 'ABSENT' : ('PRESENT' as const),
      })),
      ...signatories.slice(0, 4).map((row) => ({
        kind: 'SIGNATORY' as const,
        signatoryId: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        title: row.title,
        attendance: 'PRESENT' as const,
      })),
      ...item.guests.map((guest) => ({
        kind: 'GUEST' as const,
        firstName: guest.firstName,
        lastName: guest.lastName,
        title: guest.title,
        attendance: guest.attendance ?? 'PRESENT',
      })),
    ];
    const created = await prisma.boardMinutes.create({
      data: {
        minutesYear,
        minutesSeq,
        minutesNo: `${minutesYear}/${minutesSeq}`,
        heldAt: dateOnly(item.heldAt),
        subject: item.subject,
        body: item.body,
        status: item.status,
        createdById,
        createdAt: dateTime(item.heldAt, '11:00'),
        members: { create: members },
        requests: requestIds.length
          ? { create: requestIds.map((requestId) => ({ requestId })) }
          : undefined,
      },
    });
    minutesIds.set(item.key, created.id);
  }

  for (const item of EXTRA_RESOLUTIONS) {
    const minutesId = minutesIds.get(item.minutesKey);
    if (!minutesId) continue;
    const requestId = item.requestSubject ? requests.get(item.requestSubject)?.id ?? null : null;
    const signedAt = item.signed ? dateOnly(MINUTES.find((row) => row.key === item.minutesKey)?.heldAt ?? '1405/06/18') : null;
    const resolution = await prisma.boardMinutesResolution.create({
      data: {
        minutesId,
        requestId,
        title: item.title,
        description: item.description,
        status: item.status,
        dueKind: item.dueKind,
        dueDate: item.dueDate ? dateOnly(item.dueDate) : null,
        hasTopicHistory: Boolean(item.requestSubject),
        legalBasis: item.legalBasis,
        proposerKind: item.proposerKind,
        proposerText: item.proposerText ?? null,
        proposerUnitId: item.proposerUnit ? units[item.proposerUnit].id : null,
        notes: item.notes,
        executors: {
          create: item.executors.map((key) => ({ unitId: units[key].id })),
        },
        signatories: {
          create: signatories.map((row, index) => ({
            sourceSignatoryId: row.id,
            firstName: row.firstName,
            lastName: row.lastName,
            title: row.title,
            signatureImageId: row.signatureImageId,
            signedAt: item.signed ? signedAt : null,
            sortOrder: index,
          })),
        },
      },
    });
    const contractIds: string[] = [];
    for (const contract of item.contracts ?? []) {
      const created = await prisma.boardResolutionContract.create({
        data: {
          resolutionId: resolution.id,
          title: contract.title,
          contractNo: contract.contractNo,
          contractorId: contractors[contract.contractor].id,
          kind: contract.kind,
          amount: contract.amount,
          paidAmount: contract.paidAmount,
          duration: contract.duration,
          signedAt: dateOnly(contract.signedAt),
          startDate: dateOnly(contract.startDate),
          endDate: dateOnly(contract.endDate),
          status: contract.status,
          supervisor: contract.supervisor,
          notes: contract.notes,
        },
      });
      contractIds.push(created.id);
    }
    for (const report of item.progress ?? []) {
      const contractDef =
        report.contractIndex != null ? item.contracts?.[report.contractIndex] : undefined;
      const contractId =
        report.contractIndex != null ? contractIds[report.contractIndex] ?? null : null;
      const contractorKey = report.contractor ?? contractDef?.contractor;
      await prisma.boardResolutionProgressReport.create({
        data: {
          resolutionId: resolution.id,
          reportedAt: dateOnly(report.reportedAt),
          title: report.title,
          category: report.category,
          body: report.body,
          actionsDone: report.actionsDone,
          nextPlan: report.nextPlan,
          blockers: report.blockers ?? null,
          needs: report.needs ?? null,
          progressAmount: report.progressAmount,
          createdById,
          contractId,
          contractorId: contractorKey ? contractors[contractorKey].id : null,
        },
      });
    }
  }
  return minutesIds.size;
}

async function main() {
  const { kindByCode, positionByCode } = await ensureKindsAndPositions();
  const units = await ensureUnits(kindByCode);
  const { admin, users } = await ensureUsers(units, positionByCode);
  await ensurePermissions(units, positionByCode);
  const contractors = await ensureContractors();
  const signatories = await ensureSignatories(users);
  const removed = await resetBoardDemo();
  const requests = await seedRequests(units, users);
  const minutesCount = await seedMinutes(
    units,
    users,
    signatories,
    requests,
    contractors,
    admin.id,
  );

  const [requestTotal, minutesTotal, resolutionTotal, contractTotal] = await Promise.all([
    prisma.boardRequest.count(),
    prisma.boardMinutes.count(),
    prisma.boardMinutesResolution.count(),
    prisma.boardResolutionContract.count(),
  ]);

  console.log('داده نمایشی ماژول هیئت مدیره آماده شد.');
  console.log(`حذف قبلی: ${removed.requestsDeleted} طرح‌درخواست، ${removed.minutesDeleted} صورت‌جلسه`);
  console.log(`ثبت جدید: ${requests.size} طرح‌درخواست، ${minutesCount} صورت‌جلسه`);
  console.log(
    `وضعیت کل پایگاه: ${requestTotal} طرح، ${minutesTotal} صورت‌جلسه، ${resolutionTotal} مصوبه، ${contractTotal} قرارداد`,
  );
  console.log(`کاربران نمونه با رمز ${DEMO_PASSWORD}: demo.ceo / demo.secretary / demo.it / ...`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
