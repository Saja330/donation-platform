const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path'); // لتقديم ملفات الواجهة

const app = express();
app.use(cors());
app.use(express.json());

//  frontend files from public/
app.use(express.static(path.join(__dirname, 'public')));

// connecting with MongoDB using env identefire
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ Connected to MongoDB"))
.catch(err => console.error("❌ MongoDB connection error:", err));

//  Schemas
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

const messageSchema = new mongoose.Schema({
  donationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Donation' },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  content: String,
  timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

// Review Schema
const reviewSchema = new mongoose.Schema({
  name: String,
  rating: Number,
  comment: String
});
const Review = mongoose.model('Review', reviewSchema);



// Endpoints

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

// تسجيل الدخول
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

// إضافة تبرع
app.post('/api/donations', async (req, res) => {
  try {
    const donation = new Donation(req.body);
    await donation.save();
    res.status(201).json({ message: "تم إضافة التبرع" });
  } catch (error) {
    res.status(500).json({ error: "خطأ في حفظ التبرع" });
  }
});

//all donations
app.get('/api/donations', async (req, res) => {
  try {
    const donations = await Donation.find();
    res.json(donations);
  } catch (error) {
    res.status(500).json({ error: "فشل في جلب التبرعات" });
  }
});

// donor's donations
app.get('/api/donations/:email', async (req, res) => {
  try {
    const donations = await Donation.find({ email: req.params.email });
    res.json(donations);
  } catch (error) {
    res.status(500).json({ error: "فشل في جلب التبرعات" });
  }
});

// request donation
app.post('/api/request', async (req, res) => {
  const { itemId, receiverId } = req.body;
  try {
    const newRequest = new Request({ itemId, receiverId });
    await newRequest.save();
    await Donation.findByIdAndUpdate(itemId, { status: 'requested' });

    const needy = await User.findById(receiverId);
    const msg = new Message({
      donationId: itemId,
      senderId: receiverId,
      receiverId: null,
      content: `طلب ${needy.name} هذا التبرع`
    });
    await msg.save();

    res.json({ message: "تم الطلب" });
  } catch (error) {
    res.status(500).json({ message: "فشل الطلب" });
  }
});

// عرض التبرعات مع الطلبات
app.get('/api/donations-with-requests', async (req, res) => {
  try {
    const donations = await Donation.find();
    const requests = await Request.find().populate('receiverId');
    const enriched = donations.map(donation => {
      const req = requests.find(r => r.itemId.toString() === donation._id.toString());
      return {
        ...donation.toObject(),
        requestedBy: req ? req.receiverId?.name : null,
        requestStatus: req ? 'requested' : 'available'
      };
    });
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: "فشل في جلب التبرعات" });
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

// الرسائل
app.get('/api/messages/:userId', async (req, res) => {
  try {
    const messages = await Message.find({
      $or: [
        { senderId: req.params.userId },
        { receiverId: req.params.userId }
      ]
    }).populate('senderId receiverId donationId');
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: "فشل في جلب الرسائل" });
  }
});

app.post('/api/messages', async (req, res) => {
  try {
    const msg = new Message(req.body);
    await msg.save();
    res.json({ message: "تم إرسال الرسالة" });
  } catch (err) {
    res.status(500).json({ error: "فشل في إرسال الرسالة" });
  }
});

app.get('/api/donations/user/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });

    const donations = await Donation.find({ email: user.email });
    res.json(donations);
  } catch (err) {
    res.status(500).json({ error: "فشل في جلب تبرعات المستخدم" });
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



// when visiting / it redirect index.html from public/
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

//  running the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
