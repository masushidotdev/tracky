import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PanelSkeleton } from '@/components/app/skeletons';
import { useI18n } from '@/lib/i18n';

type FallbackLabels = {
  title: string;
  description: string;
  retry: string;
};

type BoundaryProps = {
  labels: FallbackLabels;
  children: React.ReactNode;
};

type BoundaryState = {
  error: Error | null;
};

class PanelErrorBoundaryInner extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Panel crashed', error);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle>{this.props.labels.title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-3">
          <p className="text-muted-foreground text-sm">{this.props.labels.description}</p>
          <Button variant="outline" size="sm" onClick={() => this.setState({ error: null })}>
            {this.props.labels.retry}
          </Button>
        </CardContent>
      </Card>
    );
  }
}

export function PanelErrorBoundary({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();

  return (
    <PanelErrorBoundaryInner
      labels={{
        title: t('panel.error.title'),
        description: t('panel.error.description'),
        retry: t('panel.error.retry'),
      }}
    >
      <React.Suspense fallback={<PanelSkeleton />}>{children}</React.Suspense>
    </PanelErrorBoundaryInner>
  );
}
