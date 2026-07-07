import React from 'react';
import { Check, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';

export default function ThemeSwitcher({ className }) {
  const { sessionUser, isFirebaseAuth } = useAuth();
  const { theme, setTheme, themes } = useTheme();

  if (!isFirebaseAuth || !sessionUser?.uid) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn(
            'h-9 w-9 rounded-xl shrink-0 border border-border/80 bg-background/80 backdrop-blur-sm shadow-sm',
            className
          )}
          aria-label="Theme"
          title="Theme"
        >
          <Palette className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Appearance</div>
        <DropdownMenuSeparator />
        {themes.map((t) => (
          <DropdownMenuItem
            key={t.id}
            onClick={() => setTheme(t.id)}
            className="flex items-start gap-2 cursor-pointer"
          >
            <span className="mt-0.5 w-4 flex justify-center shrink-0">
              {theme === t.id ? <Check className="w-4 h-4 text-primary" /> : null}
            </span>
            <span className="flex flex-col gap-0">
              <span className="font-medium">{t.label}</span>
              <span className="text-[11px] text-muted-foreground font-normal">{t.description}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
