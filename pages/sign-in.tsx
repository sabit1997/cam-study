import SignInForm from "@/components/sign-in-form";

export default function SignInPage() {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: "calc(100vh - 36px)" }}>
      <SignInForm />
    </div>
  );
}
