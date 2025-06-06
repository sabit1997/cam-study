"use server";

import axios, { isAxiosError } from "axios";

const ERROR_PREFIX = "HTTP_ERROR_CODE:";

export const serverFetch = async (url: string) => {
  try {
    const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}${url}`, {
      adapter: "fetch",
      fetchOptions: { caches: "force-cache" },
      withCredentials: true,
    });

    return res.data;
  } catch (error) {
    if (isAxiosError(error)) {
      console.error("Axios Error:", error.response?.status, error.message);
      if (error.response) {
        throw new Error(
          `${ERROR_PREFIX}${error.response.status}:${error.message}`
        );
      } else {
        throw new Error(`${ERROR_PREFIX}500:Network Error or Request Failed`);
      }
    }
    console.error("Unknown Error:", error);
    throw new Error(`${ERROR_PREFIX}500:An unexpected error occurred`);
  }
};
