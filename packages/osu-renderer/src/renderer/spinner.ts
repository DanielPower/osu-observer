import { Container, Sprite, Graphics, Text } from "pixi.js";
import { textures } from "../skin";

export class Spinner extends Container {
  private bottom: Sprite;
  private middle: Sprite;
  private top: Sprite;
  private approachCircle: Sprite;
  private progressCircle: Graphics;
  private spmText: Text;
  private startTime: number;
  private endTime: number;
  private lastRotation: number = 0;
  private lastRotationTime: number = 0;
  private radius: number;
  private spinsRequired: number;

  constructor({
    x,
    y,
    startTime,
    endTime,
    radius,
    scale,
    overallDifficulty = 5,
  }: {
    x: number;
    y: number;
    startTime: number;
    endTime: number;
    radius: number;
    scale: number;
    overallDifficulty?: number;
  }) {
    super();
    this.x = x;
    this.y = y;
    this.startTime = startTime;
    this.endTime = endTime;
    this.radius = radius;

    // Calculate required spins based on OD
    const duration = endTime - startTime;
    const COMPLETE_RPM_MIN = 250;
    const COMPLETE_RPM_MID = 380;
    const COMPLETE_RPM_MAX = 430;

    let requiredRPM: number;
    if (overallDifficulty <= 5) {
      requiredRPM =
        COMPLETE_RPM_MIN +
        (COMPLETE_RPM_MID - COMPLETE_RPM_MIN) * (overallDifficulty / 5);
    } else {
      requiredRPM =
        COMPLETE_RPM_MID +
        (COMPLETE_RPM_MAX - COMPLETE_RPM_MID) * ((overallDifficulty - 5) / 5);
    }

    const durationMinutes = duration / 60000;
    this.spinsRequired = requiredRPM * durationMinutes;

    // Bottom layer (static background)
    this.bottom = new Sprite({
      texture: textures["spinner-bottom"],
      anchor: 0.5,
    });
    this.bottom.width = radius * 2;
    this.bottom.height = radius * 2;
    this.addChild(this.bottom);

    // Middle layer (rotates with player input)
    this.middle = new Sprite({
      texture: textures["spinner-middle"],
      anchor: 0.5,
    });
    this.middle.width = radius * 2;
    this.middle.height = radius * 2;
    this.addChild(this.middle);

    // Top layer (indicator/overlay)
    this.top = new Sprite({
      texture: textures["spinner-top"],
      anchor: 0.5,
    });
    this.top.width = radius * 2;
    this.top.height = radius * 2;
    this.addChild(this.top);

    // Approach circle
    this.approachCircle = new Sprite({
      texture: textures["spinner-approachcircle"],
      anchor: 0.5,
    });
    this.addChild(this.approachCircle);

    // Progress circle
    this.progressCircle = new Graphics();
    this.addChild(this.progressCircle);

    // SPM text
    this.spmText = new Text({
      text: "0 SPM",
      style: {
        fill: 0xffffff,
        fontSize: 20 * scale,
        fontWeight: "bold",
      },
      anchor: 0.5,
      y: radius + 40 * scale,
    });
    this.addChild(this.spmText);

    this.lastRotationTime = startTime;
  }

  update(time: number, rotation: number) {
    // Rotate the middle disc based on accumulated rotation
    this.middle.rotation = rotation;

    // Add subtle ambient rotation to bottom and top
    const ambientRotation = ((time - this.startTime) / 1000) * 0.5;
    this.bottom.rotation = ambientRotation;
    this.top.rotation = -ambientRotation * 0.5;

    // Calculate SPM (Spins Per Minute)
    const timeDelta = time - this.lastRotationTime;
    if (timeDelta > 100) {
      // Update SPM calculation
      const rotationDelta = rotation - this.lastRotation;
      const rotationsPerSecond =
        rotationDelta / (2 * Math.PI) / (timeDelta / 1000);
      const spm = Math.abs(rotationsPerSecond * 60);
      this.spmText.text = `${Math.round(spm)} SPM`;
      this.lastRotation = rotation;
      this.lastRotationTime = time;
    }

    // Update approach circle
    const duration = this.endTime - this.startTime;
    const timeUntilEnd = this.endTime - time;
    const approachProgress = 1 - timeUntilEnd / duration;

    if (time >= this.startTime && time <= this.endTime) {
      // Scale approach circle from large to small
      const approachScale = 1 + (1 - approachProgress) * 2;
      this.approachCircle.width = this.radius * 2 * approachScale;
      this.approachCircle.height = this.radius * 2 * approachScale;
      this.approachCircle.alpha = 0.7;
    } else {
      this.approachCircle.alpha = 0;
    }

    // Calculate completion progress
    const completedSpins = rotation / (2 * Math.PI);
    const completionProgress = Math.min(1, completedSpins / this.spinsRequired);

    // Draw progress circle (completion indicator)
    this.progressCircle.clear();

    // Draw background circle
    this.progressCircle.circle(0, 0, this.radius + 15);
    this.progressCircle.stroke({ width: 6, color: 0x333333, alpha: 0.5 });

    // Draw progress arc
    if (completionProgress > 0) {
      const startAngle = -Math.PI / 2; // Start at top
      const endAngle = startAngle + completionProgress * 2 * Math.PI;

      // Use different colors based on completion
      let progressColor = 0xff6666; // Red - not complete
      if (completionProgress >= 1.0) {
        progressColor = 0x66ff66; // Green - complete
      } else if (completionProgress >= 0.75) {
        progressColor = 0xffff66; // Yellow - almost complete
      }

      this.progressCircle.arc(0, 0, this.radius + 15, startAngle, endAngle);
      this.progressCircle.stroke({
        width: 6,
        color: progressColor,
        alpha: 0.9,
      });
    }
  }
}
