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
  donorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, 
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
    const donation = await Donation.findById(itemId);
    const needy = await User.findById(receiverId);
    const donor = await User.findOne({ email: donation.email });

    const newRequest = new Request({
      itemId,
      receiverId,
      donorId: donor?._id //  تم الحفظ هنا
    });
    await newRequest.save();

    await Donation.findByIdAndUpdate(itemId, { status: 'requested' });

    const msg = new Message({
      donationId: itemId,
      senderId: receiverId,
      receiverId: donor?._id,
      content: `طلب ${needy.email} هذا التبرع`
    });
    await msg.save();

    if (donation?.email) {
      await transporter.sendMail({
        from: `"منصة عطاياكم" <${process.env.EMAIL_USER}>`,
        to: donation.email,
        subject: "📢 إشعار بطلب تبرع",
        text: `قام المستخدم ${needy.name} بطلب تبرعك "${donation.item}".`
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
const formatted = await Promise.all(requests.map(async r => {
  const donor = r.donorId ? await User.findById(r.donorId) : null;
  return {
    _id: r._id,
    timestamp: r.timestamp,
    donorId: donor?._id,
    donorEmail: donor?.email,
    donation: {
      item: r.itemId?.item,
      city: r.itemId?.city,
      _id: r.itemId?._id
    }
  };
}));



    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: 'فشل في جلب طلبات المستخدم' });
  }
});
//to add needy id
app.get('/api/requests-by-donor/:donorId', async (req, res) => {
  try {
    const requests = await Request.find({ donorId: req.params.donorId })
      .populate('itemId')
      .populate('receiverId', 'name email');

    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: 'فشل في جلب الطلبات حسب المتبرع' });
  }
});
//end point for sending
app.post('/api/messages', async (req, res) => {
  const { donationId, senderId, receiverId, content } = req.body;
  if (!donationId || !senderId || !receiverId || !content) {
    return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
  }

  try {
    const message = new Message({ donationId, senderId, receiverId, content });
    await message.save();
    res.status(201).json({ message: '✅ تم إرسال الرسالة' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '❌ فشل في إرسال الرسالة' });
  }
});
// جلب كل الرسائل الخاصة بمستخدم (سواء كمرسل أو مستقبل)
app.get('/api/messages/:userId', async (req, res) => {
  try {
    const messages = await Message.find({
      $or: [
        { senderId: req.params.userId },
        { receiverId: req.params.userId }
      ]
    })
      .populate('senderId', 'name')
      .populate('receiverId', 'name')
      .populate('donationId', 'item')
      .sort({ timestamp: 1 });

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: "فشل في تحميل الرسائل" });
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
