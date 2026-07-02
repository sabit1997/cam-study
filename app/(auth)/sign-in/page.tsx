import SignInForm from "@/components/sign-in-form";

export const metadata = {
  title: "Sign in",
  description: "Page for sign in. Email and password required.",
};

export default function SignInPage() {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: "calc(100vh - 36px)" }}>
      <SignInForm />
    </div>
  );
}
