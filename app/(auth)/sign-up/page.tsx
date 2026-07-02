import SignUpForm from "@/components/sign-up-form";

export const metadata = {
  title: "Sign up",
  description: "Page for sign up. Email and password required.",
};

export default function SignUpPage() {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: "calc(100vh - 36px)" }}>
      <SignUpForm />
    </div>
  );
}
