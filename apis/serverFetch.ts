"use server";

import axios, { isAxiosError, AxiosResponse } from "axios";

const ERROR_PREFIX = "HTTP_ERROR_CODE:";

interface FetchOptions {
  suppressStatus?: number[];
}

export async function serverFetch<T>(
  url: string,
  opts: FetchOptions = {}
): Promise<T | null> {
  try {
    const res: AxiosResponse<T> = await axios.get(
      `${process.env.NEXT_PUBLIC_API_URL}${url}`,
      {
        adapter: "fetch",
        fetchOptions: { cache: "force-cache" },
        withCredentials: true,
      }
    );
    return res.data;
  } catch (err) {
    if (isAxiosError(err)) {
      const status = err.response?.status;
      console.error("Axios Error:", status, err.message);

      if (status && opts.suppressStatus?.includes(status)) {
        return null;
      }

      if (err.response) {
        throw new Error(`${ERROR_PREFIX}${err.response.status}:${err.message}`);
      }
      throw new Error(`${ERROR_PREFIX}500:Network Error or Request Failed`);
    }

    console.error("Unknown Error:", err);
    throw new Error(`${ERROR_PREFIX}500:An unexpected error occurred`);
  }
}
