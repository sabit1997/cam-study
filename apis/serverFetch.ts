"use server";

import axios from "axios";
import { cookies } from "next/headers";

export const serverFetch = async (url: string) => {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("AccessToken")?.value;

  const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}${url}`, {
    adapter: "fetch",
    fetchOptions: { caches: "force-cache" },
    headers: {
      Authorization: accessToken ? `Bearer ${accessToken}` : "",
    },
  });

  return res.data;
};
