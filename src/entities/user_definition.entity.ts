import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity("user_definition")
export class User_definition {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", nullable: false })
  email: string;

  @Column({ type: "boolean", nullable: false, default: false })
  isRootUser: boolean;

  @Column({ type: "varchar", nullable: false })
  password: string;


  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}