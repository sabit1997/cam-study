import SignUpForm from "@/components/sign-up-form";

export const metadata = {
  title: "Sign up",
  description: "Page for sign up. Email and password required.",
};

const SignUpPage = () => {
  return (
    <div className="p-10 flex flex-col items-center">
      <h2 className="text-7xl">SIGN UP</h2>
      <SignUpForm />
    </div>
  );
};

export default SignUpPage;
