"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export class WindowErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[WindowErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed flex items-center justify-center w-60 h-20 border-2 border-dark rounded-2xl bg-primary text-sm opacity-70">
          창을 불러오는 중 오류가 발생했습니다
        </div>
      );
    }
    return this.props.children;
  }
}
