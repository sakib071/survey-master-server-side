const express = require('express')
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

//middleware
app.use(cors());
app.use(express.json());


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hybglgu.mongodb.net/?retryWrites=true&w=majority`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const userCollection = client.db("surveyMaster").collection("users");
        const surveyCollection = client.db("surveyMaster").collection("surveys");
        const testimonialCollection = client.db("surveyMaster").collection("testimonials");
        const voteCollection = client.db("surveyMaster").collection("votes");
        const paymentCollection = client.db("surveyMaster").collection("payments");
        const faqCollection = client.db("surveyMaster").collection("faq");

        //jwt related API
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token });
        })

        //middleware
        const verifyToken = (req, res, next) => {
            console.log('inside verify token: ', req.headers.authorization);
            if (!req.headers.authorization) {
                return res.status(401).send({ message: "forbidden access" })
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' })
                }
                req.decoded = decoded;
                next();
            })
        }

        // use verify admin after verifyToken
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }

        //users related API
        app.get("/users", async (req, res) => {
            const userEmail = req.query.email;

            if (userEmail) {
                // If email is provided, fetch a specific user
                const result = await userCollection.findOne({ email: userEmail });
                res.send(result);
            } else {
                // If no email is provided, fetch all users
                const result = await userCollection.find().toArray();
                res.send(result);
            }
        });

        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }

            const query = { email: email };
            const user = await userCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === 'admin';
            }
            res.send({ admin });
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            user.role = 'User';
            //insert email if user does not exist
            const query = { email: user.email }
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'User already exists', insertedId: null })
            }
            const result = await userCollection.insertOne(user);
            console.log(result);
            res.send(result);
        })

        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
        })


        // app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
        //     const id = req.params.id;
        //     const query = { _id: new ObjectId(id) }
        //     const result = await userCollection.deleteOne(query);
        //     res.send(result);
        // })


        app.get("/surveys", async (req, res) => {
            const result = await surveyCollection.find().toArray();
            res.send(result);
        })

        app.get('/surveys/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await surveyCollection.findOne(query);
            res.send(result);
        })

        app.post('/surveys', async (req, res) => {
            const item = req.body;
            const result = await surveyCollection.insertOne(item);
            res.send(result);
        });


        app.post('/votes', async (req, res) => {
            const item = req.body;
            const result = await voteCollection.insertOne(item);
            res.send(result);
        });

        app.get("/votes", async (req, res) => {
            const result = await voteCollection.find().toArray();
            res.send(result);
        })

        app.patch('/votes/:id', async (req, res) => {
            const vote = req.body;
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    name: vote.name,
                    title: vote.title,
                    category: vote.price,
                    comment: vote.comment,
                    likes: vote.likes,
                    dislikes: vote.dislikes,
                }
            }

            const result = await voteCollection.updateOne(filter, updatedDoc)
            res.send(result);
        })

        // app.delete('/votes/:id', verifyToken, async (req, res) => {
        //     const id = req.params.id;
        //     const query = { _id: new ObjectId(id) }
        //     const result = await voteCollection.deleteOne(query);
        //     res.send(result);
        // })

        app.get("/faq", async (req, res) => {
            const result = await faqCollection.find().toArray();
            res.send(result);
        })


        app.get("/testimonials", async (req, res) => {
            const result = await testimonialCollection.find().toArray();
            res.send(result);
        })

        // payment intent
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            console.log(amount, 'amount inside the intent')

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });

            res.send({
                clientSecret: paymentIntent.client_secret
            })
        });

        app.get('/payments/:email', verifyToken, async (req, res) => {
            const query = { email: req.params.email }
            if (req.params.email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            const result = await paymentCollection.find(query).toArray();
            res.send(result);
        })

        //for all payments
        app.get("/payments", async (req, res) => {
            const result = await paymentCollection.find().toArray();
            res.send(result);
        })


        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const paymentResult = await paymentCollection.insertOne(payment);
            res.send(paymentResult);
        })

        // stats or analytics
        app.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {
            const users = await userCollection.estimatedDocumentCount();
            const votes = await voteCollection.estimatedDocumentCount();
            const survey = await surveyCollection.estimatedDocumentCount();

            res.send({
                users,
                votes,
                survey
            })
        })

        // using aggregate pipeline
        app.get('/survey-stats', verifyToken, verifyAdmin, async (req, res) => {
            try {
                const result = await surveyCollection.aggregate([
                    {
                        $unwind: '$options'
                    },
                    {
                        $lookup: {
                            from: 'votes',
                            localField: 'options',
                            foreignField: '_id',
                            as: 'votes'
                        }
                    },
                    {
                        $unwind: '$votes'
                    },
                    {
                        $group: {
                            _id: '$category',
                            quantity: { $sum: 1 },
                            votes: { $sum: 1 }
                        }
                    },
                    {
                        $project: {
                            _id: 0,
                            category: '$_id',
                            quantity: '$quantity',
                            votes: '$votes'
                        }
                    }
                ]).toArray();

                res.send(result);
            } catch (error) {
                console.error("Error fetching survey stats:", error);
                res.status(500).send({ error: 'Internal Server Error' });
            }
        });



        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('survey master is running');
})

app.listen(port, () => {
    console.log(`Survey Master is listening on ${port}`);
})