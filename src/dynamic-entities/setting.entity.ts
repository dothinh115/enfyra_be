import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity("setting")
export class Setting {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({type:'boolean', nullable: false, default: false})
  isInit: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;
}