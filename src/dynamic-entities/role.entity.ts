import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity("role")
export class Role {
  @Column({type:'varchar', nullable: false, default: null})
  name: string;

  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({type:'varchar', nullable: false, default: null})
  test: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;
}