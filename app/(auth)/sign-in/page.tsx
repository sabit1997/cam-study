import SignInForm from "@/components/sign-in-form";

export const metadata = {
  title: "Sign in",
  description: "Page for sign in. Email and password required.",
};

const SignInPage = () => {
  return (
    <div className="p-10 flex flex-col items-center">
      <h2 className="text-7xl">SIGN IN</h2>
      <SignInForm />
    </div>
  );
};

export default SignInPage;
