// 로컬 모드에서 인증은 UI 자체가 존재하지 않는다 (App.tsx가 /sign-in을 홈으로
// 돌려보내고 AuthBootstrap이 refresh를 건너뛴다). 여기 도달하는 호출은 방어적
// 잔여물이라 모두 즉시 성공하는 no-op으로 반환한다.

const LOCAL_USER_ID = 0; // 서버 응답의 userId 타입(number)에 맞춘다.
const LOCAL_USERNAME = "나";

export default class AuthService {
  public static readonly signup = async (): Promise<string> => "";
  public static readonly login = async (): Promise<{
    userId: number;
    username: string;
  }> => ({ userId: LOCAL_USER_ID, username: LOCAL_USERNAME });
  public static readonly logout = async (): Promise<string> => "";
  public static readonly refresh = async (): Promise<unknown> => ({});
}
