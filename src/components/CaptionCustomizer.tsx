import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "./ColorPicker";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronDown, Type } from "lucide-react";

interface CaptionCustomizerProps {
  onApply?: (captionSettings: CaptionSettings) => void;
  onPreview?: (captionSettings: CaptionSettings) => void;
}

export interface CaptionSettings {
  style: string;
  font: string;
  fontSize: number;
  position: string;
  textColor: string;
  backgroundColor: string;
  opacity: number;
  bold: boolean;
  italic: boolean;
  uppercase: boolean;
  outline: boolean;
  outlineColor: string;
}

const defaultSettings: CaptionSettings = {
  style: "modern",
  font: "Inter",
  fontSize: 24,
  position: "bottom",
  textColor: "#FFFFFF",
  backgroundColor: "#000000",
  opacity: 80,
  bold: false,
  italic: false,
  uppercase: false,
  outline: true,
  outlineColor: "#000000",
};

const ColorPicker = ({
  color,
  onChange,
}: {
  color: string;
  onChange: (color: string) => void;
}) => {
  const colors = [
    "#FFFFFF",
    "#000000",
    "#FF0000",
    "#00FF00",
    "#0000FF",
    "#FFFF00",
    "#FF00FF",
    "#00FFFF",
  ];

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {colors.map((c) => (
        <div
          key={c}
          className={`w-6 h-6 rounded-full cursor-pointer border ${color === c ? "ring-2 ring-primary" : ""}`}
          style={{ backgroundColor: c }}
          onClick={() => onChange(c)}
        />
      ))}
      <Input
        type="text"
        value={color}
        onChange={(e) => onChange(e.target.value)}
        className="w-20 h-6 text-xs"
      />
    </div>
  );
};

const CaptionCustomizer: React.FC<CaptionCustomizerProps> = ({
  onApply,
  onPreview,
}) => {
  const [settings, setSettings] = useState<CaptionSettings>(defaultSettings);

  const handleChange = (key: keyof CaptionSettings, value: any) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const presetStyles = [
    { name: "modern", label: "Modern" },
    { name: "classic", label: "Classic" },
    { name: "minimal", label: "Minimal" },
    { name: "bold", label: "Bold" },
    { name: "tiktok", label: "TikTok Style" },
  ];

  const fontOptions = [
    { value: "Inter", label: "Inter" },
    { value: "Arial", label: "Arial" },
    { value: "Roboto", label: "Roboto" },
    { value: "Montserrat", label: "Montserrat" },
    { value: "Comic Sans MS", label: "Comic Sans" },
  ];

  const positionOptions = [
    { value: "top", label: "Top" },
    { value: "middle", label: "Middle" },
    { value: "bottom", label: "Bottom" },
  ];

  const applyPreset = (presetName: string) => {
    // Apply preset settings based on the selected style
    switch (presetName) {
      case "modern":
        setSettings({
          ...settings,
          font: "Inter",
          fontSize: 24,
          textColor: "#FFFFFF",
          backgroundColor: "#000000",
          opacity: 80,
          bold: false,
          outline: true,
        });
        break;
      case "classic":
        setSettings({
          ...settings,
          font: "Arial",
          fontSize: 22,
          textColor: "#FFFFFF",
          backgroundColor: "#000000",
          opacity: 100,
          bold: true,
          outline: false,
        });
        break;
      case "minimal":
        setSettings({
          ...settings,
          font: "Roboto",
          fontSize: 20,
          textColor: "#FFFFFF",
          backgroundColor: "transparent",
          opacity: 0,
          bold: false,
          outline: true,
        });
        break;
      case "bold":
        setSettings({
          ...settings,
          font: "Montserrat",
          fontSize: 28,
          textColor: "#FFFFFF",
          backgroundColor: "#FF0000",
          opacity: 90,
          bold: true,
          outline: false,
        });
        break;
      case "tiktok":
        setSettings({
          ...settings,
          font: "Comic Sans MS",
          fontSize: 26,
          textColor: "#FFFFFF",
          backgroundColor: "#000000",
          opacity: 70,
          bold: true,
          outline: false,
          uppercase: true,
        });
        break;
    }
  };

  return (
    <Card className="w-full bg-background">
      <CardHeader>
        <CardTitle className="text-lg">Caption Customization</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="style" className="w-full">
          <TabsList className="grid grid-cols-3 mb-4">
            <TabsTrigger value="style">Style</TabsTrigger>
            <TabsTrigger value="text">Text</TabsTrigger>
            <TabsTrigger value="background">Background</TabsTrigger>
          </TabsList>

          <TabsContent value="style" className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {presetStyles.map((style) => (
                <Button
                  key={style.name}
                  variant={
                    settings.style === style.name ? "default" : "outline"
                  }
                  className="h-auto py-2 px-3 flex flex-col items-center justify-center"
                  onClick={() => {
                    handleChange("style", style.name);
                    applyPreset(style.name);
                  }}
                >
                  <span className="text-xs">{style.label}</span>
                </Button>
              ))}
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="position">Position</Label>
                <Select
                  value={settings.position}
                  onValueChange={(value) => handleChange("position", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select position" />
                  </SelectTrigger>
                  <SelectContent>
                    {positionOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="text" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="font">Font</Label>
              <Select
                value={settings.font}
                onValueChange={(value) => handleChange("font", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select font" />
                </SelectTrigger>
                <SelectContent>
                  {fontOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fontSize">Font Size: {settings.fontSize}px</Label>
              <Slider
                id="fontSize"
                min={12}
                max={48}
                step={1}
                value={[settings.fontSize]}
                onValueChange={(value) => handleChange("fontSize", value[0])}
              />
            </div>

            <div className="space-y-2">
              <Label>Text Color</Label>
              <ColorPicker
                color={settings.textColor}
                onChange={(color) => handleChange("textColor", color)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="bold"
                  checked={settings.bold}
                  onCheckedChange={(checked) => handleChange("bold", checked)}
                />
                <Label htmlFor="bold">Bold</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="italic"
                  checked={settings.italic}
                  onCheckedChange={(checked) => handleChange("italic", checked)}
                />
                <Label htmlFor="italic">Italic</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="uppercase"
                  checked={settings.uppercase}
                  onCheckedChange={(checked) =>
                    handleChange("uppercase", checked)
                  }
                />
                <Label htmlFor="uppercase">Uppercase</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="outline"
                  checked={settings.outline}
                  onCheckedChange={(checked) =>
                    handleChange("outline", checked)
                  }
                />
                <Label htmlFor="outline">Text Outline</Label>
              </div>
            </div>

            {settings.outline && (
              <div className="space-y-2">
                <Label>Outline Color</Label>
                <ColorPicker
                  color={settings.outlineColor}
                  onChange={(color) => handleChange("outlineColor", color)}
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="background" className="space-y-4">
            <div className="space-y-2">
              <Label>Background Color</Label>
              <ColorPicker
                color={settings.backgroundColor}
                onChange={(color) => handleChange("backgroundColor", color)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="opacity">Opacity: {settings.opacity}%</Label>
              <Slider
                id="opacity"
                min={0}
                max={100}
                step={5}
                value={[settings.opacity]}
                onValueChange={(value) => handleChange("opacity", value[0])}
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end space-x-2 mt-6">
          <Button variant="outline" onClick={() => onPreview?.(settings)}>
            Preview
          </Button>
          <Button onClick={() => onApply?.(settings)}>Apply</Button>
        </div>

        {/* Caption Preview */}
        <div className="mt-6 p-4 bg-gray-900 rounded-md relative">
          <div className="aspect-video bg-gray-800 flex items-center justify-center">
            <div
              className={`px-4 py-2 max-w-[80%] text-center ${settings.position === "top" ? "absolute top-4" : settings.position === "middle" ? "absolute" : "absolute bottom-4"}`}
              style={{
                fontFamily: settings.font,
                fontSize: `${settings.fontSize}px`,
                color: settings.textColor,
                backgroundColor:
                  settings.backgroundColor !== "transparent"
                    ? `${settings.backgroundColor}${Math.round(
                        settings.opacity * 2.55,
                      )
                        .toString(16)
                        .padStart(2, "0")}`
                    : "transparent",
                fontWeight: settings.bold ? "bold" : "normal",
                fontStyle: settings.italic ? "italic" : "normal",
                textTransform: settings.uppercase ? "uppercase" : "none",
                textShadow: settings.outline
                  ? `1px 1px 1px ${settings.outlineColor}, -1px -1px 1px ${settings.outlineColor}, 1px -1px 1px ${settings.outlineColor}, -1px 1px 1px ${settings.outlineColor}`
                  : "none",
              }}
            >
              Preview of your caption text with the selected styling options
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CaptionCustomizer;
