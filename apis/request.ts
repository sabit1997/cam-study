import axios, {
  AxiosError,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";

interface QueueItem {
  resolve: (value: AxiosResponse) => void;
  reject: (error: unknown) => void;
}

export const client = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    Accept: "application/json, text/plain, */*",
  },
  withCredentials: true,
});

let isRefreshing = false;
let failedQueue: QueueItem[] = [];

const processQueue = (error?: unknown, tokenResponse?: AxiosResponse) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else if (tokenResponse) {
      resolve(tokenResponse);
    }
  });
  failedQueue = [];
};

client.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (err: AxiosError) => {
    const status = err.response?.status;
    const originalRequest = err.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (isRefreshing) {
        return new Promise<AxiosResponse>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => client(originalRequest));
      }

      isRefreshing = true;

      try {
        const refreshResponse = await client.post("/auth/refresh");

        processQueue(undefined, refreshResponse);
        isRefreshing = false;

        return client(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        isRefreshing = false;
        window.location.href = "/sign-in";
        return Promise.reject(refreshError);
      }
    }

    if (status === 403) {
      alert("권한이 없습니다.");
      return Promise.reject(err);
    }

    return Promise.reject(err);
  }
);

const request = async <T = unknown>(
  options: AxiosRequestConfig
): Promise<T> => {
  try {
    const response = await client(options);
    return response.data as T;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return Promise.reject({
        message: error.message,
        code: error.code,
        response: error.response,
      });
    }
    return Promise.reject(error);
  }
};

export default request;
