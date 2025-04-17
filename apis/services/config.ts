export const AuthEndPoints = {
  signup: () => "/auth/signup",
  login: () => "/auth/login",
};

export const WindowEndpoints = {
  getWindows: () => "/windows",
  createWindow: () => "/windows",
  patchWindow: (id: number) => `/windows/${id}`,
  deleteWindow: (id: number) => `/windows/${id}`,
};
