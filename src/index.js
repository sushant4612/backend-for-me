import dotenv from "dotenv"
import connectDB from "./db/index.js"
import app from "./app.js"

dotenv.config({
    path: './.env'
})

connectDB()
.then( () => {
    app.listen(process.env.PORT || 4000, () => {
        console.log("Server is running")
    })
})
.catch((err) => {
    console.log(`MONGO DB Connection Failed !!! ${err} `)
})