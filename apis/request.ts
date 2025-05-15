import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";

export const client = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    Accept: "application/json, text/plain, */*",
  },
});

client.interceptors.request.use(
  (config) => {
    const getAccessTokenFromCookie = () => {
      const match = document.cookie.match(
        new RegExp("(^| )AccessToken=([^;]+)")
      );
      return match ? match[2] : null;
    };

    const token = getAccessTokenFromCookie();

    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

client.interceptors.response.use(
  (res: AxiosResponse) => res,
  async (err) => {
    const status = err.response?.status;

    if (status === 401) {
      document.cookie = "AccessToken=; path=/; max-age=0";
      alert("로그인이 만료되었습니다. 다시 로그인해주세요.");
      window.location.href = "/sign-in";
      return Promise.reject(err);
    }

    if (status === 403) {
      alert("이 기능을 사용할 권한이 없습니다.");
      return Promise.reject(err.response?.data || err);
    }

    return Promise.reject(err);
  }
);

const request = async (options: AxiosRequestConfig) => {
  const onSuccess = (response: AxiosResponse) => {
    return response.data;
  };

  const onError = (error: AxiosError) => {
    return Promise.reject({
      message: error.message,
      code: error.code,
      response: error.response,
    });
  };

  return client(options).then(onSuccess).catch(onError);
};

export default request;
