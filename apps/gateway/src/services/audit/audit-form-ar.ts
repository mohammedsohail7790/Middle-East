/**
 * Arabic for the audit pages, keyed by the exact English text used in audit-form-definition.ts and audit-form-page.ts.
 * The page shows both languages (lang-en / lang-ar) and the site's language switch picks one. A test fails if an English string has no Arabic here.
 */
export const AUDIT_AR: Record<string, string> = {
  'Halla AI Consultancy':
    'استشارات Halla AI',
  'Opportunity Audit questionnaire':
    'استبيان تدقيق الفرص',
  'Send my answers →':
    'أرسل إجاباتي ←',
  'Choose…':
    'اختر…',
  'Process':
    'العملية',
  'System':
    'النظام',
  'Add another process':
    'أضف عملية أخرى',
  'Add another system':
    'أضف نظاماً آخر',
  'Answer what you can and leave the rest blank; "not sure" is a fine answer. Please do not type passwords, card numbers or ID numbers. We treat everything you send as confidential. If you would like an NDA signed before you send it, write to hello@hallaai.com first.':
    'أجب بما تستطيع واترك الباقي فارغاً؛ و"لست متأكداً" إجابة مقبولة. يرجى عدم كتابة كلمات المرور أو أرقام البطاقات أو أرقام الهوية. نتعامل مع كل ما ترسله بسرية. وإن أردت توقيع اتفاقية عدم إفصاح قبل أن ترسله، راسل hello@hallaai.com أولاً.',
  'Checking your link…':
    'جارٍ التحقق من الرابط…',
  'Pay securely →':
    'ادفع بأمان ←',
  'Card payment is handled by Stripe. The audit fee is separate from any build. Once we deliver your audit, the fee cannot be refunded.':
    'تتم معالجة الدفع بالبطاقة عبر Stripe. رسوم التدقيق منفصلة عن أي مشروع بناء. بعد تسليم التدقيق لا يمكن استرداد الرسوم.',
  'Required. Everything else is optional.':
    'مطلوب. كل ما عدا ذلك اختياري.',
  'What you get: a prioritised roadmap with payoff estimates and a fixed build price for every opportunity, valid for 30 days.':
    'ما تحصل عليه: خارطة طريق مرتبة بالأولوية مع تقديرات العائد وسعر بناء ثابت لكل فرصة، صالحة لمدة 30 يوماً.',
  'Questions? Write to hello@hallaai.com.':
    'أسئلة؟ راسلنا على hello@hallaai.com.',
  'Thank you, payment received':
    'شكراً لك، وصلنا الدفع',
  'The details we need to study your business. It takes about 20 minutes. Your answers are saved on this device as you type, so you can close the page and come back.':
    'التفاصيل التي نحتاجها لدراسة عملك. يستغرق الأمر نحو 20 دقيقة. تُحفظ إجاباتك على هذا الجهاز أثناء الكتابة، فيمكنك إغلاق الصفحة والعودة لاحقاً.',
  'Your audit is ready':
    'تدقيقك جاهز',
  'Pay the audit fee and we send you the full audit.':
    'ادفع رسوم التدقيق ونرسل لك التدقيق الكامل.',
  'We will send your audit to the email address you gave us. If you do not see it within one business day, write to hello@hallaai.com.':
    'سنرسل التدقيق إلى عنوان البريد الإلكتروني الذي زوّدتنا به. إن لم تجده خلال يوم عمل واحد، راسل hello@hallaai.com.',
  'A. Business overview and goals':
    'أ. نظرة عامة على النشاط والأهداف',
  'What is your company name and what is your core business?':
    'ما اسم شركتك وما نشاطك الأساسي؟',
  'Who is the primary contact person for this project?':
    'من هو الشخص الرئيسي للتواصل بشأن هذا المشروع؟',
  'What is the main goal or outcome you want to achieve with this automation or AI project?':
    'ما الهدف أو النتيجة الرئيسية التي تريد تحقيقها من مشروع الأتمتة أو الذكاء الاصطناعي هذا؟',
  'For example: reduce manual data entry, or speed up customer support response times.':
    'مثال: تقليل إدخال البيانات يدوياً، أو تسريع الرد على استفسارات العملاء.',
  'What does success look like for this project?':
    'كيف يبدو النجاح في هذا المشروع؟',
  'For example: saving 10 hours a week, zero data entry errors, or handling 500 more inquiries a month.':
    'مثال: توفير 10 ساعات أسبوعياً، أو عدم وجود أخطاء في إدخال البيانات، أو التعامل مع 500 استفسار إضافي شهرياً.',
  'B. Current process and workflows':
    'ب. العملية الحالية وسير العمل',
  'How is this process currently handled today?':
    'كيف تُنفَّذ هذه العملية حالياً؟',
  'Please walk us through it step by step.':
    'يرجى شرحها لنا خطوة بخطوة.',
  'How much time does your team spend on this manual process each week?':
    'كم من الوقت يقضيه فريقك في هذه العملية اليدوية كل أسبوع؟',
  'Roughly how many transactions, documents or customer inquiries do you process per month?':
    'تقريباً كم عدد المعاملات أو المستندات أو استفسارات العملاء التي تعالجونها شهرياً؟',
  'What percentage of these items follow a standard format, and what percentage are messy or unpredictable?':
    'ما نسبة هذه البنود التي تتبع صيغة موحدة، وما نسبة غير المنظم أو غير المتوقع منها؟',
  'Standard: uniform invoices, structured forms. Messy: handwritten notes, random emails.':
    'موحد: فواتير متماثلة أو نماذج منظمة. غير منظم: ملاحظات بخط اليد أو رسائل بريد عشوائية.',
  'What is your current error rate or manual exception rate, and where does the process usually break down?':
    'ما معدل الأخطاء أو الحالات الاستثنائية اليدوية لديكم حالياً، وأين تتعطل العملية عادةً؟',
  'C. Software, systems and data':
    'ج. البرمجيات والأنظمة والبيانات',
  'What software, CRM or tools are you currently using to run this process?':
    'ما البرمجيات أو نظام إدارة العملاء أو الأدوات التي تستخدمونها حالياً لتشغيل هذه العملية؟',
  'Are your current software tools cloud-based with accessible APIs or webhooks, or are they older on-premise legacy systems?':
    'هل أدواتكم الحالية سحابية وتتيح واجهات برمجة التطبيقات (API) أو خطافات الويب، أم أنها أنظمة قديمة تعمل داخل مقر الشركة؟',
  'Do you currently have developer documentation, admin access, or IT support available to help connect these tools?':
    'هل لديكم حالياً وثائق للمطورين أو صلاحيات إدارية أو دعم تقني يساعد في ربط هذه الأدوات؟',
  'Where is your data currently stored?':
    'أين تُحفظ بياناتكم حالياً؟',
  'For example: Google Sheets, a cloud database, local servers, or physical filing cabinets.':
    'مثال: جداول Google، أو قاعدة بيانات سحابية، أو خوادم محلية، أو ملفات ورقية.',
  'D. Security, privacy and compliance':
    'د. الأمان والخصوصية والامتثال',
  'Does this process involve sensitive or regulated data?':
    'هل تتضمن هذه العملية بيانات حساسة أو خاضعة للتنظيم؟',
  'For example: customer financial records, health data, or passwords.':
    'مثال: السجلات المالية للعملاء، أو البيانات الصحية، أو كلمات المرور.',
  'Are there any local data privacy laws, industry regulations or company policies we need to follow?':
    'هل هناك قوانين محلية لخصوصية البيانات أو لوائح قطاعية أو سياسات داخلية يجب أن نلتزم بها؟',
  'For example: UAE or KSA data regulations, or GDPR.':
    'مثال: أنظمة البيانات في الإمارات أو السعودية، أو اللائحة العامة لحماية البيانات (GDPR).',
  'Do you require user data to be encrypted or hosted in a specific geographic region?':
    'هل تشترطون تشفير بيانات المستخدمين أو استضافتها في منطقة جغرافية محددة؟',
  'E. Human oversight and exceptions':
    'هـ. الإشراف البشري والحالات الاستثنائية',
  'Can this workflow run fully automated from start to finish, or does a human need to review and approve certain steps?':
    'هل يمكن تشغيل سير العمل هذا آلياً بالكامل من البداية إلى النهاية، أم يلزم أن يراجع شخص بعض الخطوات ويوافق عليها؟',
  'If the system encounters an error or an unusual request, how should it notify your team?':
    'إذا واجه النظام خطأً أو طلباً غير معتاد، فكيف ينبغي أن يُخطر فريقكم؟',
  'For example: by email, Slack, or a dashboard alert.':
    'مثال: بالبريد الإلكتروني، أو عبر Slack، أو بتنبيه على لوحة التحكم.',
  'F. Timeline, budget and next steps':
    'و. الجدول الزمني والميزانية والخطوات التالية',
  'Who is the ultimate project sponsor or decision-maker for this build?':
    'من الراعي النهائي للمشروع أو صاحب القرار فيه؟',
  'What is your target go-live date or deadline for this project?':
    'ما تاريخ التشغيل المستهدف أو الموعد النهائي لهذا المشروع؟',
  'What is your allocated budget range for this build?':
    'ما نطاق الميزانية المخصصة لهذا المشروع؟',
  'For example: under AED 10k, AED 10k to 30k, or AED 30k and above.':
    'مثال: أقل من 10 آلاف درهم، أو من 10 إلى 30 ألف درهم، أو 30 ألف درهم فأكثر.',
  'Are there any other specific requirements, constraints or tools you want us to keep in mind?':
    'هل هناك متطلبات أو قيود أو أدوات أخرى محددة تريدون أن نضعها في الاعتبار؟',
};
