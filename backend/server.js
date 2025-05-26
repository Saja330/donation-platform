require('dotenv').config(); // لتحميل متغيرات البيئة من .env

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer'); // لإرسال البريد الإلكتروني

const app = express();
app.use(cors());
app.use(express.json());

// إعداد نقل البريد الإلكتروني
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // بريد الإرسال
    pass: process.env.EMAIL_PASS  // كلمة مرور التطبيق
  }
});

// تقديم ملفات الواجهة من مجلد public
app.use(express.static(path.join(__dirname, 'public')));

// database connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ Connected to MongoDB"))
.catch(err => console.error("❌ MongoDB connection error:", err));

// === Schemas ===
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  type: { type: String, enum: ['donor', 'needy'] }
});
const User = mongoose.model('User', userSchema);

const donationSchema = new mongoose.Schema({
  item: String,
  category: String,
  condition: String,
  description: String,
  city: String,
  image: String,
  email: String,
  status: { type: String, default: 'available' },
  date: String
});
const Donation = mongoose.model('Donation', donationSchema);

const requestSchema = new mongoose.Schema({
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Donation' },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  timestamp: { type: Date, default: Date.now }
});
const Request = mongoose.model('Request', requestSchema);

const messageSchema = new mongoose.Schema({
  donationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Donation' },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  content: String,
  timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

const reviewSchema = new mongoose.Schema({
  name: String,
  rating: Number,
  comment: String
});
const Review = mongoose.model('Review', reviewSchema);

// === Endpoints ===

// تسجيل مستخدم
app.post('/api/register', async (req, res) => {
  try {
    const user = new User(req.body);
    await user.save();
    res.status(201).json({ message: "تم التسجيل" });
  } catch (err) {
    res.status(500).json({ error: "فشل التسجيل", details: err });
  }
});

// login 
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email, password });
    if (!user) return res.status(401).json({ message: "بيانات غير صحيحة" });

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      type: user.type
    });
  } catch (err) {
    res.status(500).json({ error: "فشل تسجيل الدخول" });
  }
});

// add donation
app.post('/api/donations', async (req, res) => {
  try {
    const donation = new Donation(req.body);
    await donation.save();
    res.status(201).json({ message: "تم إضافة التبرع" });
  } catch (error) {
    res.status(500).json({ error: "خطأ في حفظ التبرع" });
  }
});

// كل التبرعات
app.get('/api/donations', async (req, res) => {
  try {
    const donations = await Donation.find();
    res.json(donations);
  } catch (error) {
    res.status(500).json({ error: "فشل في جلب التبرعات" });
  }
});

// تبرعات متبرع حسب بريده
app.get('/api/donations/:email', async (req, res) => {
  try {
    const donations = await Donation.find({ email: req.params.email });
    res.json(donations);
  } catch (error) {
    res.status(500).json({ error: "فشل في جلب التبرعات" });
  }
});

// طلب تبرع (مع إرسال إشعار عبر البريد)
app.post('/api/request', async (req, res) => {
  const { itemId, receiverId } = req.body;
  try {
    const newRequest = new Request({ itemId, receiverId });
    await newRequest.save();
    await Donation.findByIdAndUpdate(itemId, { status: 'requested' });

    const needy = await User.findById(receiverId);
    const donation = await Donation.findById(itemId);

    const msg = new Message({
      donationId: itemId,
      senderId: receiverId,
      receiverId: null,
      content: `طلب ${needy.email} هذا التبرع`
    });
    await msg.save();

    // donor notification
    if (donation && donation.email) {
      await transporter.sendMail({
        from: `"منصة عطاياكم" <${process.env.EMAIL_USER}>`,
        to: donation.email,
        subject: "📢 إشعار بطلب تبرع",
        text: `قام المستخدم ${needy.name} بطلب تبرعك "${donation.item}". يرجى الدخول إلى المنصة لمزيد من التفاصيل.`
      });
    }

    res.json({ message: "تم الطلب وتم إرسال الإشعار" });
  } catch (error) {
    res.status(500).json({ message: "فشل الطلب", error });
  }
});

// reciever requests
app.get('/api/requests-by-user/:userId', async (req, res) => {
  try {
    const requests = await Request.find({ receiverId: req.params.userId }).populate('itemId');
    const formatted = requests.map(r => ({
      _id: r._id,
      timestamp: r.timestamp,
      donation: {
        item: r.itemId?.item,
        location: r.itemId?.location,
        email: r.itemId?.email,
        _id: r.itemId?._id
      }
    }));
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: 'فشل في جلب طلبات المستخدم' });
  }
});
// جلب كل الرسائل المرتبطة بتبرع معين
app.get('/api/chat/:donationId', async (req, res) => {
  try {
    const messages = await Message.find({ donationId: req.params.donationId })
      .populate('senderId', 'name')
      .populate('receiverId', 'name')
      .sort({ timestamp: 1 });

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: "فشل في تحميل المحادثة" });
  }
});

// جلب كل المراجعات
app.get('/api/reviews', async (req, res) => {
  try {
    const reviews = await Review.find().sort({ _id: -1 }).limit(5);
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: "فشل في جلب المراجعات" });
  }
});

// إضافة مراجعة (يتطلب تسجيل الدخول من الواجهة)
app.post('/api/reviews', async (req, res) => {
  try {
    const { name, rating, comment } = req.body;
    if (!name || !comment || !rating) {
      return res.status(400).json({ error: "جميع الحقول مطلوبة ويجب تسجيل الدخول" });
    }

    const review = new Review({ name, rating, comment });
    await review.save();
    res.status(201).json({ message: "تمت إضافة المراجعة" });
  } catch (err) {
    res.status(500).json({ error: "فشل في إضافة المراجعة" });
  }
});
//  endpoints 

// عند زيارة /
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
