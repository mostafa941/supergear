import { config } from "../../config";

// Upload image through the backend server which securely communicates with Cloudinary
const BACKEND_URL = config?.baseUrl || "http://localhost:8000";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const upload = async (file: any): Promise<string> => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${BACKEND_URL}/upload`, {
    method: "POST",
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("Upload error from server:", data);
    throw new Error(data?.error || "Failed to upload image");
  }

  return data.secure_url as string;
};

export default upload;