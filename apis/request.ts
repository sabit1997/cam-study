import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";

export const client = (() => {
  return axios.create({
    baseURL: process.env.REACT_BASE_URL,
    headers: {
      Accept: "application/json, text/plain, */*",
    },
  });
})();

client.interceptors.response.use(
  (res: AxiosResponse) => res,
  async (err) => {
    const status = err.response?.status;

    if (status === 401) {
      localStorage.removeItem("ACCESS_TOKEN");

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
    const { data } = response;
    return data;
  };

  const onError = function (error: AxiosError) {
    return Promise.reject({
      message: error.message,
      code: error.code,
      response: error.response,
    });
  };

  return client(options).then(onSuccess).catch(onError);
};

export default request;
