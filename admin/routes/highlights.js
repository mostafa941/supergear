import { Router } from "express";
import { highlightsProducts } from "../constants/index.js";


const router = Router();

router.get("/highlights", (req, res) => {
  res.send(highlightsProducts);
});

export default router;