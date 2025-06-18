import request from "@/apis/request";
import { AxiosMethod } from "@/types/axios";
import { AuthEndPoints } from "../config";

export interface AuthRequest {
  email: string;
  password: string;
}

interface AuthRequestWithName extends AuthRequest {
  username: string;
}

export default class AuthService {
  public static readonly signup = (
    data: AuthRequestWithName
  ): Promise<string> => {
    return request({
      url: AuthEndPoints.signup(),
      method: AxiosMethod.POST,
      data,
    });
  };

  public static readonly login = (data: AuthRequest): Promise<string> => {
    return request({
      url: AuthEndPoints.login(),
      method: AxiosMethod.POST,
      data,
    });
  };
  public static readonly logout = (): Promise<string> => {
    return request({
      url: AuthEndPoints.logout(),
      method: AxiosMethod.POST,
    });
  };
}
