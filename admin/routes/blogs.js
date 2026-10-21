import Router from "express"
import { blogsData } from "../constants/index.js"

const router = Router()

router.get("/blogs" , (req,res)=>{
    res.send(blogsData)
})

export default router;