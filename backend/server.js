const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// ✅ تقديم ملفات الواجهة (frontend)
app.use(express.static(path.join(__dirname, 'public')));

// ✅ الاتصال بقاعدة بيانات Mongo محليًا أو من خلال env متغير
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/attayakum', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ Connected to MongoDB"))
.catch(err => console.error("❌ MongoDB connection error:", err));

// ✅ Schemas
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  type: { type: String, enum: ['donor', 'needy'] },
  nationalId: String // للمحتاجين فقط
});
const User = mongoose.model('User', userSchema);

const donationSchema = new mongoose.Schema({
  item: String,
  category: String,
  condition: String,
  description: String,
  location: String,
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

// ✅ تسجيل مستخدم
app.post('/api/register', async (req, res) => {
  try {
    const user = new User(req.body);
    await user.save();
    res.status(201).json({ message: "تم التسجيل" });
  } catch (err) {
    res.status(500).json({ error: "فشل التسجيل", details: err });
  }
});

// ✅ تسجيل الدخول
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email, password });
    if (!user) return res.status(401).json({ message: "بيانات غير صحيحة" });

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        type: user.type
      }
    });
  } catch (err) {
    res.status(500).json({ error: "فشل تسجيل الدخول" });
  }
});

// ✅ إضافة تبرع
app.post('/api/donations', async (req, res) => {
  try {
    const donation = new Donation(req.body);
    await donation.save();
    res.status(201).json({ message: "تم إضافة التبرع" });
  } catch (error) {
    res.status(500).json({ error: "خطأ في حفظ التبرع" });
  }
});

// ✅ جميع التبرعات
app.get('/api/donations', async (req, res) => {
  try {
    const donations = await Donation.find();
    res.json(donations);
  } catch (error) {
    res.status(500).json({ error: "فشل في جلب التبرعات" });
  }
});

// ✅ تبرعات مستخدم معين حسب بريده
app.get('/api/donations/:email', async (req, res) => {
  try {
    const donations = await Donation.find({ email: req.params.email });
    res.json(donations);
  } catch (error) {
    res.status(500).json({ error: "فشل في جلب التبرعات" });
  }
});

// ✅ طلب تبرع
app.post('/api/request', async (req, res) => {
  const { itemId, receiverId } = req.body;
  try {
    const newRequest = new Request({ itemId, receiverId });
    await newRequest.save();
    await Donation.findByIdAndUpdate(itemId, { status: 'requested' });

    res.json({ message: "تم الطلب" });
  } catch (error) {
    res.status(500).json({ message: "فشل الطلب" });
  }
});

// ✅ جلب طلبات مستخدم محتاج
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

// ✅ المسار الافتراضي للصفحة الرئيسية
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ✅ تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
