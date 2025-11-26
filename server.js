const express = require("express");
const cors = require("cors");
require("dotenv").config();
const userRoute = require("./userroutes");
const barcodeRoute = require("./barcode");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

// Development-friendly Content Security Policy
// Allows data:, same-origin images and connections to localhost and the React DevTools endpoint used by Chrome.
// In production you should tighten this policy.
if (process.env.NODE_ENV !== 'production') {
	app.use((req, res, next) => {
		res.setHeader("Content-Security-Policy",
			"default-src 'self'; connect-src 'self' http://localhost:5173 http://localhost:8000 https://localhost:5173 https://localhost:8000 https://react-devtools.example.com; img-src 'self' data: https: http:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:;"
		)
		next()
	})
}

// 👇 Add this line to serve uploaded images
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/users", userRoute);
app.use("/api/visitors", userRoute);
app.use("/api/barcode", barcodeRoute);

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
module.exports = app;