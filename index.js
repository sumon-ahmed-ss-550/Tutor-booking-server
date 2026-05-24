const express = require("express");
const app = express();
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();
const port = process.env.PORT;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
const uri = process.env.MONGODB_URL;

app.use(cors());
app.use(express.json());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);

const verifyToken = async (req, res, next) => {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({
      message: "Unauthorized access",
    });
  }

  const token = header.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      message: "Unauthorized access",
    });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);
    console.log(payload);
    next();
  } catch (error) {
    return res.status(403).json({
      message: "Forbidden",
    });
  }
};

const run = async () => {
  try {
    // await client.connect();

    const database = client.db("Tutor_booking");
    const collection = database.collection("tutors-data");
    const bookingCollection = database.collection("booking-data");

    app.get("/tutors", async (req, res) => {
      try {
        const { search, after, before } = req.query;

        let query = {};

        // SEARCH BY NAME OR SUBJECT
        if (search) {
          query.$or = [
            {
              tutorName: {
                $regex: search,
                $options: "i",
              },
            },
            {
              subject: {
                $regex: search,
                $options: "i",
              },
            },
          ];
        }

        // DATE RANGE FILTER
        if (after || before) {
          query.sessionStartDate = {};

          if (after) {
            query.sessionStartDate.$gte = after;
          }

          if (before) {
            query.sessionStartDate.$lte = before;
          }
        }

        const result = await collection.find(query).limit(6).toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Failed to fetch tutors",
          error: error.message,
        });
      }
    });

    // get one data
    app.get("/tutors/:id", async (req, res) => {
      const id = req.params.id;
      const query = {
        _id: new ObjectId(id),
      };
      const result = await collection.findOne(query);
      res.send(result);
    });

    app.get("/tutors/user/:userId", async (req, res) => {
      const { userId } = req.params;
      const result = await collection.find({ userId: userId }).toArray();
      res.send(result);
    });

    // post data of database
    app.post("/tutors", verifyToken, async (req, res) => {
      const data = req.body;
      const result = await collection.insertOne(data);
      res.send(result);
    });

    // post booking data
    app.post("/tutors/booking", async (req, res) => {
      try {
        const data = req.body;

        // 1. booking insert
        const bookingResult = await bookingCollection.insertOne(data);

        // 2. tutors collection থেকে slot কমানো
        await collection.updateOne(
          { _id: new ObjectId(data.tutorId) },
          {
            $inc: { totalSlot: -1 },
          },
        );

        res.send({
          success: true,
          bookingResult,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Booking failed",
          error: error.message,
        });
      }
    });

    // get booking data
    app.get("/tutors/booking/:userId", async (req, res) => {
      const { userId } = req.params;
      const result = await bookingCollection.find({ userId: userId }).toArray();
      res.send(result);
    });

    // update cancelled booking
    app.patch("/booking/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await bookingCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: { status: "Cancelled" },
          },
        );

        res.send({
          success: true,
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Failed to update booking",
          error: error.message,
        });
      }
    });

    app.patch("/tutors/user/:userId", async (req, res) => {
      const { userId } = req.params;
      const data = req.body;
      const filter = { userId: userId };
      const updateDoc = {
        $set: data,
      };
      const result = await collection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // delete user
    app.delete("/tutors/user/:userId", async (req, res) => {
      const { userId } = req.params;
      const result = await collection.deleteOne({ userId: userId });
      res.send(result);
    });

    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // await client.close();
  }
};
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello, World");
});

app.listen(port, (req, res) => {
  console.log(`Example app listening on port ${port}`);
});
