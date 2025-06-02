import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity("role")
export class Role {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({type:'varchar', nullable: false, default: null})
  name: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;
}