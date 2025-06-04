import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity("setting_definition")
export class Setting_definition {
  @Column({ type: "boolean", nullable: false, default: false })
  isInit: boolean;

  @PrimaryGeneratedColumn('increment')
  id: number;


  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;
}