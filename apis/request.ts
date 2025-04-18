import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";

export const client = (() => {
  return axios.create({
    baseURL: "http://15.165.120.75:8080",
    headers: {
      Accept: "application/json, text/plain, */*",
    },
  });
})();

client.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("AccessToken");

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
      localStorage.removeItem("AccessToken");
      alert("로그인이 만료되었습니다. 다시 로그인해주세요.");
      window.location.href = "/sign-in";
      return Promise.reject(err);
    }

    if (status === 403 && err.response?.data) {
      return Promise.reject(err.response.data);
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
