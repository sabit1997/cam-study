import request from "@/apis/request";
import { WindowEndpoints } from "../config";
import { WindowPatchDto } from "@/types/dto";
import { AxiosMethod } from "@/types/axios";
import { Window } from "@/types/windows";
import { serverFetch } from "@/apis/serverFetch";

export default class WindowService {
  public static readonly createWindow = (
    data: Omit<Window, "id" | "userId" | "createdAt">
  ): Promise<Window> => {
    return request({
      url: WindowEndpoints.createWindow(),
      method: AxiosMethod.POST,
      data,
    });
  };

  public static readonly patchWindow = (
    id: number,
    data: WindowPatchDto
  ): Promise<Window> => {
    return request({
      url: WindowEndpoints.patchWindow(id),
      method: AxiosMethod.PATCH,
      data,
    });
  };

  public static readonly deleteWindow = (id: number): Promise<void> => {
    return request({
      url: WindowEndpoints.deleteWindow(id),
      method: AxiosMethod.DELETE,
    });
  };
}

export const fetchWindows = async (): Promise<Window[]> => {
  try {
    const data = await serverFetch(WindowEndpoints.getWindows());
    console.log(data);

    return data;
  } catch (error) {
    console.error("Failed to fetch windows:", error);
    throw error;
  }
};
