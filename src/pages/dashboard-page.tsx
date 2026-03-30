import { Link } from "react-router-dom";
import { ArrowRight, Library, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function DashboardPage() {
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Video Highlight Studio</CardTitle>
          <CardDescription>
            Analyze long-form content, preview and trim highlights, then render vertical clips with captions.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link to="/new">
              <Sparkles className="mr-2 h-4 w-4" />
              Start New Analysis
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/library">
              <Library className="mr-2 h-4 w-4" />
              View Library
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <ValueCard title="Detailed UI" text="Dedicated pages for setup, analysis, queue, and exports." />
        <ValueCard title="Responsive Flow" text="Mobile-first layout with sticky actions and compact queue cards." />
        <ValueCard title="Preview First" text="Edit timeline in/out before rendering each selected highlight." />
      </div>
    </div>
  );
}

function ValueCard({ title, text }: { title: string; text: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-end justify-between gap-3">
        <p className="text-sm text-muted-foreground">{text}</p>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </CardContent>
    </Card>
  );
}

