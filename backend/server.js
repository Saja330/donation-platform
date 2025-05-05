// ... [بقية المتطلبات كما هي]
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// connect with mongDB
mongoose.connect('mongodb+srv://Admin:Pass12345word@attayakumdb.erjxbsq.mongodb.net/?retryWrites=true&w=majority')
  .then(() => console.log("  Connected to MongoDB !"))
  .catch(err => console.error("  MongoDB connection error:", err));

// Schemas
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

// Registration api
app.post('/api/register', async (req, res) => {
  try {
    const user = new User(req.body);
    await user.save();
    res.status(201).json({ message: "تم التسجيل" });
  } catch (err) {
    res.status(500).json({ error: "فشل التسجيل", details: err });
  }
});

// Sign in
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

// get all donations 
app.get('/api/donations', async (req, res) => {
  try {
    const donations = await Donation.find();
    res.json(donations);
  } catch (error) {
    res.status(500).json({ error: "فشل في جلب التبرعات" });
  }
});

//   git user's donation
app.get('/api/donations/:email', async (req, res) => {
  try {
    const donations = await Donation.find({ email: req.params.email });
    res.json(donations);
  } catch (error) {
    res.status(500).json({ error: "فشل في جلب التبرعات" });
  }
});

// request a donation
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

//   عرض تبرعات مع حالة الطلب
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

//   get recievers requests
app.get('/api/requests-by-user/:userId', async (req, res) => {
  try {
    const requests = await Request.find({ receiverId: req.params.userId }).populate('itemId');
    const formatted = requests.map(r => ({
      _id: r._id,
      timestamp: r.timestamp,
      donation: r.itemId
    }));
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: 'فشل في جلب طلبات المستخدم' });
  }
});

//   الرسائل
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

// servrer runinng
app.listen(3000, () => {
  console.log("🚀 Server running on http://localhost:3000");
});
